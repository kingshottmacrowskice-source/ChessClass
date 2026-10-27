import {describe,it,expect} from 'vitest';
import {bubbleDuration} from './speech';
import {actionFrame,actions} from './actions';
describe('speech and action timing',()=>{
 it('gives longer speech more reading time with bounded duration',()=>{expect(bubbleDuration('好')).toBe(2200);expect(bubbleDuration('这枚棋子我就不客气啦')).toBeGreaterThan(bubbleDuration('好'));expect(bubbleDuration('棋'.repeat(500))).toBe(14000);});
 it('loops locomotion but holds final frame for one-shot actions',()=>{expect(actions).toHaveLength(9);expect(actionFrame(1,7)).toBe(1);expect(actionFrame(5,7)).toBe(5);expect(actionFrame(8,100)).toBe(5);});
});
