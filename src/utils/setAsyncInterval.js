// import sleep from './sleep';

// export default function (fn, ms) {
//   let stopped;

//   (async () => {
//     for (;;) {
//       await sleep(ms);

//       if (stopped) { break; }

//       await fn();
//     }
//   })();

//   return () => {
//     stopped = true;
//   };
// }
