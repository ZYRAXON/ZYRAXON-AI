export function dlopen() { return { symbols: {} } }
export function ptr() { return 0 }
export function read() { return null }
export class CString { toString() { return "" } }
export const FFIType = {
  void: 0, i8: 1, u8: 2, i16: 3, u16: 4, i32: 5, u32: 6,
  i64: 7, u64: 8, f32: 9, f64: 10, bool: 11, ptr: 12, cstring: 13,
}
