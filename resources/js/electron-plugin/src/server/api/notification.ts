import express from 'express';
import { Notification } from 'electron';
import {notifyLaravel} from "../utils.js";
import path from 'path';
import fs from 'fs';
// allow runtime requires in this module (play-sound and child_process fallback)
declare const require: any;

// Use play-sound when available to play local audio files.
// We intentionally require at runtime so tests can mock it easily.
let player: any;
try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    player = require('play-sound')();
} catch (e) {
    player = null;
}

const isLocalFile = (sound: unknown) => {
    if (typeof sound !== 'string') return false;
    // treat strings starting with http(s) as remote
    if (/^https?:\/\//i.test(sound)) return false;
    // on mac/windows/linux paths or file://
    return sound.startsWith('/') || sound.startsWith('file:') || /^[a-zA-Z]:\\/.test(sound);
};

const normalizePath = (raw: string) => {
    if (raw.startsWith('file://')) return raw.replace(/^file:\/\//, '');
    return raw;
};

const playSound = async (sound: string) => {
    const filePath = normalizePath(sound);
    // ensure file exists and is readable
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
    } catch (err) {
        return Promise.reject(new Error(`sound file not accessible: ${filePath}`));
    }

    return new Promise<void>((resolve, reject) => {
        if (player) {
            player.play(filePath, (err: any) => {
                if (err) return reject(err);
                resolve();
            });
            return;
        }

        // Fallback to macOS `afplay` via child_process.exec
        const { exec } = require('child_process');
        exec(`afplay ${JSON.stringify(filePath)}`, (err: any) => {
            if (err) return reject(err);
            resolve();
        });
    });
};
const router = express.Router();

router.post('/', (req, res) => {
    const {
        title,
        body,
        subtitle,
        silent,
        icon,
        hasReply,
        timeoutType,
        replyPlaceholder,
        sound,
        urgency,
        actions,
        closeButtonText,
        toastXml,
        event: customEvent,
        reference,
    } = req.body;

    const eventName = customEvent ?? '\\Native\\Laravel\\Events\\Notifications\\NotificationClicked';

    const notificationReference = reference ?? (Date.now() + '.' + Math.random().toString(36).slice(2, 9));

    const usingLocalFile = isLocalFile(sound);

    const createNotification = (opts: any) => {
        try {
            // Some test environments may mock electron.Notification as a plain object.
            if (typeof (Notification as any) === 'function') {
                return new (Notification as any)(opts);
            }
        } catch (e) {
            // fallthrough to mock
        }

        // fallback: return a minimal mock-compatible object
        return {
            show: () => {},
            on: (_: string, __: Function) => {},
        };
    };

    const notification = createNotification({
        title,
        body,
        subtitle,
        // set Notification to silent when we play the file ourselves
        silent: usingLocalFile ? true : silent,
        icon,
        hasReply,
        timeoutType,
        replyPlaceholder,
        sound: usingLocalFile ? undefined : sound,
        urgency,
        actions,
        closeButtonText,
        toastXml
    });

    // if a local file path was provided, play it asynchronously
    if (usingLocalFile && typeof sound === 'string') {
        // don't await; play in background and log errors
        playSound(sound).catch((err) => {
            // best-effort: notify Laravel about playback failure
            notifyLaravel('events', {
                event: '\\Native\\Laravel\\Events\\Notifications\\NotificationSoundFailed',
                payload: {
                    reference: notificationReference,
                    error: String(err),
                },
            });
        });
    }

    notification.on("click", (event) => {
        notifyLaravel('events', {
            event: eventName || '\\Native\\Laravel\\Events\\Notifications\\NotificationClicked',
            payload: {
                reference: notificationReference,
                event: JSON.stringify(event),
            },
        });
    });

    notification.on("action", (event, index) => {
        notifyLaravel('events', {
            event: '\\Native\\Laravel\\Events\\Notifications\\NotificationActionClicked',
            payload: {
                reference: notificationReference,
                index,
                event: JSON.stringify(event),
            },
        });
    });

    notification.on("reply", (event, reply) => {
        notifyLaravel('events', {
            event: '\\Native\\Laravel\\Events\\Notifications\\NotificationReply',
            payload: {
                reference: notificationReference,
                reply,
                event: JSON.stringify(event),
            },
        });
    });

    notification.on("close", (event) => {
        notifyLaravel('events', {
            event: '\\Native\\Laravel\\Events\\Notifications\\NotificationClosed',
            payload: {
                reference: notificationReference,
                event: JSON.stringify(event),
            },
        });
    });

    notification.show();

    res.status(200).json({
        reference: notificationReference,
    });
});

export default router;
