import fs from "fs"

export const readFile = (imagePath: string): Promise<Buffer<ArrayBufferLike>> => {
  return new Promise((resolve, reject) => {
    fs.readFile(imagePath, async (err, buffer) => {
      if(err) {
        reject(err)
      }
      resolve(buffer)
    })
  })
}