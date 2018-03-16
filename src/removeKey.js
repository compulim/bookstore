export default function removeKey(map, key) {
  const { [key]: deleted, ...nextMap } = map;

  return nextMap;
}
