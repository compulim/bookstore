import promisify from './promisify';

test('sync resolve', () => {
  const perform = (a, b, callback) => {
    callback(null, a + b);
  };

  return expect(promisify(perform)(1, 2)).resolves.toBe(3);
});

test('async resolve', () => {
  const perform = (a, b, callback) => {
    setTimeout(() => {
      callback(null, a + b);
    });
  };

  return expect(promisify(perform)(1, 2)).resolves.toBe(3);
});

test('sync reject', () => {
  const perform = (a, b, callback) => {
    callback(new Error('failed'));
  };

  return expect(promisify(perform)(1, 2)).rejects.toThrow('failed');
});

test('async reject', () => {
  const perform = (a, b, callback) => {
    setTimeout(() => {
      callback(new Error('failed'));
    });
  };

  return expect(promisify(perform)(1, 2)).rejects.toThrow('failed');
});
