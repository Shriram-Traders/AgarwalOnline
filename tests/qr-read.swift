import Foundation
import CoreImage
let data = FileManager.default.contents(atPath: CommandLine.arguments[1])!
let codes = try! JSONSerialization.jsonObject(with: data) as! [[String: Any]]
let detector = CIDetector(ofType: CIDetectorTypeQRCode, context: nil, options: [CIDetectorAccuracy: CIDetectorAccuracyHigh])!
var failures = 0
for code in codes {
  let text = code["text"] as! String
  let rows = code["rows"] as! [String]
  let n = rows.count, scale = 8, quiet = 4, side = (n + quiet * 2) * scale
  var pixels = [UInt8](repeating: 255, count: side * side)
  for (y, row) in rows.enumerated() { for (x, c) in row.enumerated() where c == "1" {
    for dy in 0..<scale { for dx in 0..<scale { pixels[((y + quiet) * scale + dy) * side + (x + quiet) * scale + dx] = 0 } }
  } }
  let provider = CGDataProvider(data: Data(pixels) as CFData)!
  let image = CGImage(width: side, height: side, bitsPerComponent: 8, bitsPerPixel: 8, bytesPerRow: side, space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGBitmapInfo(rawValue: 0), provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent)!
  let read = detector.features(in: CIImage(cgImage: image)).compactMap { ($0 as? CIQRCodeFeature)?.messageString }.first
  let ok = read == text
  if !ok { failures += 1 }
  print(ok ? "PASS" : "FAIL", "v\((n - 17) / 4)", text.count, ok ? "" : "read: \(read ?? "nothing")")
}
exit(failures == 0 ? 0 : 1)
