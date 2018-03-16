export default function promisify(fn, context) {
  return function () {
    return new Promise((resolve, reject) => {
      const args = [].slice.call(arguments);

      args.push((err, result) => {
        err ? reject(err) : resolve(result);
      });

      fn.apply(context, args);
    });
  };
}
