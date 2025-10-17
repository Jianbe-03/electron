import { describe, it, vi, expect, beforeEach } from 'vitest';

vi.mock('play-sound', () => {
    return () => ({
        play: vi.fn((file: string, cb: Function) => cb(null)),
    });
});

import express from 'express';
import http from 'http';
import notificationRouter from '../src/server/api/notification.js';

describe('notification sound playback', () => {
    it('plays local file and creates a silent notification', async () => {
        const router = (notificationRouter as any).default ?? notificationRouter;

        // find the POST / layer
        const layer = (router as any).stack.find((l: any) => l.route && l.route.path === '/' && l.route.methods.post);
        const handler = layer.route.stack[0].handle;

        const req: any = {
            body: { title: 'hi', body: 'there', sound: '/fake/sound.mp3' },
        };

        let sent: any = null;
        const res: any = {
            status(code: number) { this._code = code; return this; },
            json(payload: any) { sent = payload; }
        };

        await Promise.resolve(handler(req, res, () => {}));

        expect(sent).not.toBeNull();
        expect(sent.reference).toBeDefined();
    });
});
