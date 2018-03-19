export default function removeKey(map, ...keys) {
  return Object.keys(map).reduce((nextMap, key) => {
    if (!keys.includes(key)) {
      nextMap[key] = map[key];
    }

    return nextMap;
  }, {});
}
