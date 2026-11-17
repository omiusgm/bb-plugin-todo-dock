import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { avatarHash, avatarState, celebrationDeadline, type StateThread } from './avatar-state.ts';
import { AVATAR_THEME } from './avatar-theme.ts';

const now = 2_000_000;
const base: StateThread = { status: 'idle', hasPendingInteraction: false, indicator: 'none', isUnread: false, lastReadAt: now, updatedAt: now };
const state = (changes: Partial<StateThread>, deadline = 0) => avatarState({ ...base, ...changes }, now, 20, deadline);

test('ошибка и запрос ввода имеют приоритет над работой и празднованием', () => {
  assert.equal(state({ status: 'error', hasPendingInteraction: true, isUnread: true }, now + 1), 'err');
  assert.equal(state({ status: 'active', indicator: 'unread-error' }), 'err');
  assert.equal(state({ status: 'active', hasPendingInteraction: true }), 'need');
  assert.equal(state({ status: 'idle', indicator: 'waiting-for-input' }, now + 1), 'need');
});

test('работа, запуск, непрочитанный результат и отдых', () => {
  assert.equal(state({ status: 'starting' }), 'think');
  assert.equal(state({ status: 'active', isUnread: true }), 'work');
  assert.equal(state({ status: 'stopping' }), 'work');
  assert.equal(state({ isUnread: true }, now + 1), 'celebrate');
  assert.equal(state({ isUnread: true }, now), 'done');
  assert.equal(state({}), 'rest');
});

test('сон начинается по последней активности или прочтению, на границе времени', () => {
  const old = now - 20 * 60_000;
  assert.equal(state({ lastReadAt: old, updatedAt: old }), 'sleep');
  assert.equal(state({ lastReadAt: old + 1, updatedAt: old }), 'rest');
  assert.equal(state({ lastReadAt: old, updatedAt: old + 1 }), 'rest');
  assert.equal(state({ lastReadAt: null, updatedAt: old }), 'sleep');
  assert.equal(state({ lastReadAt: old, updatedAt: old, isUnread: true }), 'done');
});

test('празднование только на наблюдаемом переходе при включённой радости', () => {
  assert.equal(celebrationDeadline(undefined, 'idle', now, true), 0);
  assert.equal(celebrationDeadline('idle', 'idle', now, true), 0);
  assert.equal(celebrationDeadline('active', 'idle', now, false), 0);
  assert.equal(celebrationDeadline('active', 'idle', now, true), now + AVATAR_THEME.celebrationMs);
});

test('выбор питомца стабилен для одного идентификатора', () => {
  assert.equal(avatarHash('thread-1'), avatarHash('thread-1'));
  assert.notEqual(avatarHash('thread-1'), avatarHash('thread-2'));
});
