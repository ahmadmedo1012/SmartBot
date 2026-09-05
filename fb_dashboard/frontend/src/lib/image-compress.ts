/** Compress image to max specified dimension, JPEG quality 0.7.
 *  Ported from Smart-Menu (smart-link.ly shared identity) — identical logic,
 *  keeps receipt uploads light on mobile data before POST /api/upload. */
export function compressImage(file: File, maxDim = 1200, quality = 0.7): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const scale = Math.min(maxDim / img.width, maxDim / img.height, 1)
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement("canvas")
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext("2d")!
      ctx.drawImage(img, 0, 0, w, h)
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Image compress failed"))),
        "image/jpeg",
        quality
      )
    }
    img.onerror = () => reject(new Error("فشل قراءة الصورة"))
    img.src = URL.createObjectURL(file)
  })
}
