import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceCacheKey } from '../scripts/local-voice-cache.mjs';
test('local voice cache separates text, speed and pitch and uses safe filenames',()=>{
 const original=voiceCacheKey('こんにちは',1.2,0.8);
 assert.match(original,/^[a-f0-9]{64}$/);
 assert.notEqual(original,voiceCacheKey('さようなら',1.2,0.8));
 assert.notEqual(original,voiceCacheKey('こんにちは',1.1,0.8));
 assert.notEqual(original,voiceCacheKey('こんにちは',1.2,1));
 assert.equal(original,voiceCacheKey('こんにちは',1.2,0.8));
});
