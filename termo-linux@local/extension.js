/**
 * Termo Linux - GNOME Shell Extension
 * Displays CPU and GPU temperature in the top panel
 * Supports: AMD/Intel CPU, AMD/Intel/NVIDIA GPU via thermal zones and hwmon
 */

const { Clutter, GLib, Gio, St } = imports.gi;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

/**
 * Read file contents synchronously, returns trimmed string or null
 */
function readFile(path) {
    try {
        const [ok, contents] = GLib.file_get_contents(path);
        if (ok && contents && contents.length > 0) {
            const str = typeof contents.toString === 'function'
                ? contents.toString() : String.fromCharCode.apply(null, contents);
            return str.trim();
        }
    } catch (e) {}
    return null;
}

/**
 * Read CPU temp from thermal zones or hwmon (k10temp/coretemp)
 */
function readCpuTemp() {
    // Try thermal zones first
    try {
        const thermalDir = Gio.file_new_for_path('/sys/class/thermal');
        if (!thermalDir.query_exists(null)) return null;
        const dirents = thermalDir.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        if (dirents) {
            let info;
            while ((info = dirents.next_file(null)) !== null) {
                const name = info.get_name();
                if (!name.startsWith('thermal_zone')) continue;

                const zonePath = `/sys/class/thermal/${name}`;
                const type = readFile(`${zonePath}/type`);
                const tempStr = readFile(`${zonePath}/temp`);
                if (!type || !tempStr) continue;

                const temp = Math.floor(parseInt(tempStr, 10) / 1000);
                if (temp > 0 && temp < 150) {
                    // Only return known CPU thermal zone types (others may be GPU, chipset, etc.)
                    if (type === 'x86_pkg_temp' || type === 'Tctl' || type === 'k10temp') {
                        return temp;
                    }
                }
            }
        }
    } catch (e) {}

    // Fallback: hwmon (k10temp=AMD, coretemp=Intel)
    try {
        const hwmonDir = Gio.file_new_for_path('/sys/class/hwmon');
        if (!hwmonDir.query_exists(null)) return null;
        const dirents = hwmonDir.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        if (dirents) {
            let info;
            while ((info = dirents.next_file(null)) !== null) {
                const name = info.get_name();
                const hwmonName = readFile(`/sys/class/hwmon/${name}/name`);
                if (hwmonName !== 'k10temp' && hwmonName !== 'coretemp') continue;

                const basePath = `/sys/class/hwmon/${name}`;
                const dir = Gio.file_new_for_path(basePath);
                const enumDir = dir.enumerate_children(
                    'standard::name',
                    Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                    null
                );
                if (enumDir) {
                    let fileInfo;
                    while ((fileInfo = enumDir.next_file(null)) !== null) {
                        const fname = fileInfo.get_name();
                        if (fname.startsWith('temp') && fname.endsWith('_input')) {
                            const tempStr = readFile(`${basePath}/${fname}`);
                            if (tempStr) {
                                const temp = Math.floor(parseInt(tempStr, 10) / 1000);
                                if (temp > 0 && temp < 150) return temp;
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {}

    return null;
}

/**
 * Read temp from hwmon device (temp*_input files)
 */
function readTempFromHwmon(basePath) {
    try {
        const dir = Gio.file_new_for_path(basePath);
        const enumDir = dir.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        if (!enumDir) return null;

        let fileInfo;
        while ((fileInfo = enumDir.next_file(null)) !== null) {
            const fname = fileInfo.get_name();
            if (fname.startsWith('temp') && fname.endsWith('_input')) {
                const tempStr = readFile(`${basePath}/${fname}`);
                if (tempStr) {
                    const temp = Math.floor(parseInt(tempStr, 10) / 1000);
                    if (temp > 0 && temp < 150) return temp;
                }
            }
        }
    } catch (e) {}
    return null;
}

/**
 * Read GPU temp from hwmon (AMD/Intel via DRM, NVIDIA via hwmon)
 */
function readGpuTemp() {
    // AMD/Intel: via DRM card device hwmon
    try {
        const drmDir = Gio.file_new_for_path('/sys/class/drm');
        if (drmDir.query_exists(null)) {
            const dirents = drmDir.enumerate_children(
                'standard::name',
                Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                null
            );
            if (dirents) {
                let info;
                while ((info = dirents.next_file(null)) !== null) {
                    const name = info.get_name();
                    if (!name.startsWith('card') || name.indexOf('-') >= 0) continue;

                    const hwmonPath = `/sys/class/drm/${name}/device/hwmon`;
                    const hwmonFile = Gio.file_new_for_path(hwmonPath);
                    if (!hwmonFile.query_exists(null)) continue;

                    const enumHwmon = hwmonFile.enumerate_children(
                        'standard::name',
                        Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
                        null
                    );
                    if (!enumHwmon) continue;

                    let hwmonInfo;
                    while ((hwmonInfo = enumHwmon.next_file(null)) !== null) {
                        const hname = hwmonInfo.get_name();
                        const basePath = `${hwmonPath}/${hname}`;
                        const temp = readTempFromHwmon(basePath);
                        if (temp !== null) return temp;
                    }
                }
            }
        }
    } catch (e) {}

    // NVIDIA: direct hwmon (nvidia or nouveau driver)
    try {
        const hwmonDir = Gio.file_new_for_path('/sys/class/hwmon');
        if (!hwmonDir.query_exists(null)) return null;
        const dirents = hwmonDir.enumerate_children(
            'standard::name',
            Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
            null
        );
        if (!dirents) return null;

        let info;
        while ((info = dirents.next_file(null)) !== null) {
            const hname = info.get_name();
            const hwmonName = readFile(`/sys/class/hwmon/${hname}/name`);
            if (hwmonName !== 'nvidia' && hwmonName !== 'nouveau') continue;

            const basePath = `/sys/class/hwmon/${hname}`;
            const temp = readTempFromHwmon(basePath);
            if (temp !== null) return temp;
        }
    } catch (e) {}

    return null;
}

/**
 * Get RGBA color for temperature: green (<45), orange (45-59), red (60+)
 * Returns [r, g, b, a] in 0-1 range for Cairo
 */
function getTempColorRgba(temp) {
    if (temp === null) return [224/255, 94/255, 38/255, 1];                 // orange (unknown)
    if (temp >= 60) return [224/255, 38/255, 38/255, 1];                    // red
    if (temp < 45) return [38/255, 195/255, 94/255, 1];                     // green
    return [224/255, 94/255, 38/255, 1];                                    // orange
}

/**
 * Create a circular dot widget drawn with Cairo (GNOME Shell CSS border-radius is unreliable)
 */
function createTempDot() {
    const size = 10;
    let currentTemp = null;

    const area = new St.DrawingArea({
        width: size,
        height: size,
        style_class: 'termo-dot-wrapper',
        y_align: Clutter.ActorAlign.CENTER
    });

    area.connect('repaint', function() {
        const cr = area.get_context();
        const [r, g, b, a] = getTempColorRgba(currentTemp);
        cr.setSourceRGBA(r, g, b, a);
        cr.arc(size / 2, size / 2, size / 2 - 0.5, 0, 2 * Math.PI);
        cr.fill();
        cr.$dispose();
        return true;
    });

    return {
        widget: area,
        setTemp(temp) {
            currentTemp = temp;
            area.queue_repaint();
        }
    };
}

/**
 * Format temperatures for display
 */
function formatTemperatures() {
    const cpu = readCpuTemp();
    const gpu = readGpuTemp();
    const cpuStr = cpu !== null ? `${cpu}°C` : 'N/A';
    const gpuStr = gpu !== null ? `${gpu}°C` : 'N/A';
    return {
        cpuText: `CPU: ${cpuStr}`,
        gpuText: `GPU: ${gpuStr}`,
        cpu: cpu,
        gpu: gpu
    };
}


class TermoExtension {
    constructor() {
        this._indicator = null;
        this._cpuLabel = null;
        this._gpuLabel = null;
        this._cpuDot = null;
        this._gpuDot = null;
        this._timeoutId = null;
    }

    enable() {
        this._indicator = new PanelMenu.Button(0.0, Me.metadata.name, false);

        // Layout: [CPU dot] [CPU: XX°C] | [GPU dot] [GPU: XX°C]
        const box = new St.BoxLayout({
            style_class: 'termo-container',
            vertical: false
        });

        // CPU circle - drawn with Cairo for perfect circle
        const cpuDotObj = createTempDot();
        this._cpuDot = cpuDotObj.widget;

        this._cpuLabel = new St.Label({
            text: '---',
            style_class: 'termo-label',
            y_align: Clutter.ActorAlign.CENTER
        });

        // GPU circle - drawn with Cairo for perfect circle
        const gpuDotObj = createTempDot();
        this._gpuDot = gpuDotObj.widget;

        this._gpuLabel = new St.Label({
            text: '---',
            style_class: 'termo-label',
            y_align: Clutter.ActorAlign.CENTER
        });

        box.add_child(this._cpuDot);
        box.add_child(this._cpuLabel);
        box.add_child(this._gpuDot);
        box.add_child(this._gpuLabel);
        this._indicator.add_child(box);

        Main.panel.addToStatusArea(Me.metadata.uuid, this._indicator);

        const self = this;
        const update = () => {
            const result = formatTemperatures();
            self._cpuLabel.set_text(result.cpuText);
            self._gpuLabel.set_text(result.gpuText);
            cpuDotObj.setTemp(result.cpu);
            gpuDotObj.setTemp(result.gpu);
            return GLib.SOURCE_CONTINUE;
        };
        update(); // initial update
        this._timeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, update);
    }

    disable() {
        if (this._timeoutId) {
            GLib.Source.remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
            this._cpuLabel = null;
            this._gpuLabel = null;
            this._cpuDot = null;
            this._gpuDot = null;
        }
    }
}

function init() {
    return new TermoExtension();
}
