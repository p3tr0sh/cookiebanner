type Key = string | number;

type Dict = { [key in Key]: any };

export function filterDict(dict: Dict, keys: Key[]): Dict {
  let result: Dict = {};
  for (const key of Object.keys(dict)) {
    if (keys.includes(parseInt(key))) {
      result[key] = dict[key];
    }
  }
  return result;
}
