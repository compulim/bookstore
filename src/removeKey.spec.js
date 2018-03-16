import removeKey from './removeKey';

test('remove key', () => {
  const map = { abc: 123, def: 456, xyz: 789 };
  const actual = removeKey(map, 'def');

  expect(actual).not.toHaveProperty('def');
  expect(actual).toEqual({ abc: 123, xyz: 789 });
});
