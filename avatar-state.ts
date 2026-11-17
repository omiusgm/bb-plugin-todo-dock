import type { PluginSidebarThread } from '@get-bb/plugin-sdk/app';
import { AVATAR_THEME, type PetState } from './avatar-theme.ts';
export type StateThread = Pick<PluginSidebarThread, 'status' | 'hasPendingInteraction' | 'indicator' | 'isUnread' | 'lastReadAt' | 'updatedAt'>;
export function avatarState(t: StateThread, now: number, sleepMinutes: number, celebrateUntil = 0): PetState {
    if (t.status === 'error' || t.indicator === 'unread-error')
        return 'err';
    if (t.hasPendingInteraction || t.indicator === 'waiting-for-input')
        return 'need';
    if (t.status === 'starting')
        return 'think';
    if (t.status === 'active' || t.status === 'stopping')
        return 'work';
    if (t.status === 'idle' && celebrateUntil > now)
        return 'celebrate';
    if (t.isUnread)
        return 'done';
    return now - Math.max(t.lastReadAt ?? 0, t.updatedAt) >= sleepMinutes * 60000 ? 'sleep' : 'rest';
}
export function celebrationDeadline(previous: string | undefined, current: string, now: number, joy: boolean) {
    return joy && previous === 'active' && current === 'idle' ? now + AVATAR_THEME.celebrationMs : 0;
}
export function avatarHash(text: string) { let h = 0; for (const c of text)
    h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
