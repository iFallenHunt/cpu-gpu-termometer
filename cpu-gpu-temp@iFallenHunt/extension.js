import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

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

function readCpuTemp() {
    try {
        const thermalDir = Gio.file_new_for_path('/sys/class/thermal');
        if (!thermalDir.query_exists(null)) return null;
        const dirents = thermalDir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
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
                    if (type === 'x86_pkg_temp' || type === 'Tctl' || type === 'k10temp')
                        return temp;
                }
            }
        }
    } catch (e) {}

    try {
        const hwmonDir = Gio.file_new_for_path('/sys/class/hwmon');
        if (!hwmonDir.query_exists(null)) return null;
        const dirents = hwmonDir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
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
                    'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
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

function readTempFromHwmon(basePath) {
    try {
        const dir = Gio.file_new_for_path(basePath);
        const enumDir = dir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
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

function readGpuTemp() {
    try {
        const drmDir = Gio.file_new_for_path('/sys/class/drm');
        if (drmDir.query_exists(null)) {
            const dirents = drmDir.enumerate_children(
                'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
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
                        'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
                    );
                    if (!enumHwmon) continue;
                    let hwmonInfo;
                    while ((hwmonInfo = enumHwmon.next_file(null)) !== null) {
                        const hname = hwmonInfo.get_name();
                        const temp = readTempFromHwmon(`${hwmonPath}/${hname}`);
                        if (temp !== null) return temp;
                    }
                }
            }
        }
    } catch (e) {}

    try {
        const hwmonDir = Gio.file_new_for_path('/sys/class/hwmon');
        if (!hwmonDir.query_exists(null)) return null;
        const dirents = hwmonDir.enumerate_children(
            'standard::name', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null
        );
        if (!dirents) return null;
        let info;
        while ((info = dirents.next_file(null)) !== null) {
            const hname = info.get_name();
            const hwmonName = readFile(`/sys/class/hwmon/${hname}/name`);
            if (hwmonName !== 'nvidia' && hwmonName !== 'nouveau') continue;
            const temp = readTempFromHwmon(`/sys/class/hwmon/${hname}`);
            if (temp !== null) return temp;
        }
    } catch (e) {}

    return null;
}

function getTempColorRgba(temp) {
    if (temp === null) return [224/255, 94/255, 38/255, 1];
    if (temp >= 60) return [224/255, 38/255, 38/255, 1];
    if (temp < 45) return [38/255, 195/255, 94/255, 1];
    return [224/255, 94/255, 38/255, 1];
}

function createTempDot() {
    const size = 10;
    let currentTemp = null;

    const area = new St.DrawingArea({
        width: size,
        height: size,
        style_class: 'termo-dot-wrapper',
        y_align: Clutter.ActorAlign.CENTER
    });

    area.connect('repaint', function () {
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

function formatTemperatures() {
    const cpu = readCpuTemp();
    const gpu = readGpuTemp();
    return {
        cpuText: `CPU: ${cpu !== null ? `${cpu}°C` : 'N/A'}`,
        gpuText: `GPU: ${gpu !== null ? `${gpu}°C` : 'N/A'}`,
        cpu,
        gpu
    };
}

export default class TermoExtension extends Extension {
    enable() {
        this._indicator = new PanelMenu.Button(0.0, this.metadata.name, false);

        const initialResult = formatTemperatures();
        this._hasGpu = initialResult.gpu !== null;

        const box = new St.BoxLayout({ style_class: 'termo-container', vertical: false });

        const cpuDotObj = createTempDot();
        this._cpuLabel = new St.Label({
            text: '---',
            style_class: 'termo-label',
            y_align: Clutter.ActorAlign.CENTER
        });

        box.add_child(cpuDotObj.widget);
        box.add_child(this._cpuLabel);

        let gpuDotObj = null;
        if (this._hasGpu) {
            box.add_child(new St.Label({
                text: ' | ',
                style_class: 'termo-label',
                y_align: Clutter.ActorAlign.CENTER
            }));
            gpuDotObj = createTempDot();
            this._gpuLabel = new St.Label({
                text: '---',
                style_class: 'termo-label',
                y_align: Clutter.ActorAlign.CENTER
            });
            box.add_child(gpuDotObj.widget);
            box.add_child(this._gpuLabel);
        }

        this._indicator.add_child(box);
        Main.panel.addToStatusArea(this.metadata.uuid, this._indicator);

        const update = () => {
            const result = formatTemperatures();
            this._cpuLabel.set_text(result.cpuText);
            cpuDotObj.setTemp(result.cpu);
            if (this._hasGpu && gpuDotObj) {
                this._gpuLabel.set_text(result.gpuText);
                gpuDotObj.setTemp(result.gpu);
            }
            return GLib.SOURCE_CONTINUE;
        };
        update();
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
        }
        this._cpuLabel = null;
        this._gpuLabel = null;
    }
}
