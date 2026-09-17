import { compress } from 'lzma1';
const data = Buffer.from('igObjectList igTextureAttr2 '.repeat(200), 'latin1');
for (const mode of [1, 5, 9]) {
  const out = Buffer.from(compress(new Uint8Array(data), mode));
  console.log(
    'mode',
    mode,
    'header',
    out.subarray(0, 13).toString('hex'),
    'total',
    out.length,
    'size field',
    out.readBigInt64LE(5),
  );
}
