import webgazer from '.'
import mat from './mat'
import params from './params'
import numeric from 'numeric'

// const util = {}

var resizeWidth = 10
var resizeHeight = 6

//not used !?
/**
 * Eye class, represents an eye patch detected in the video stream
 * @param {ImageData} patch - the image data corresponding to an eye
 * @param {Number} imagex - x-axis offset from the top-left corner of the video canvas
 * @param {Number} imagey - y-axis offset from the top-left corner of the video canvas
 * @param {Number} width  - width of the eye patch
 * @param {Number} height - height of the eye patch
 */
export class Eye {
  patch: ImageData
  imagex: number
  imagey: number
  width: number
  height: number

  constructor(
    patch: ImageData,
    imagex: number,
    imagey: number,
    width: number,
    height: number
  ) {
    this.patch = patch
    this.imagex = imagex
    this.imagey = imagey
    this.width = width
    this.height = height
  }
}

/**
 * Compute eyes size as gray histogram
 * @param {Object} eyes - The eyes where looking for gray histogram
 * @returns {Array.<T>} The eyes gray level histogram
 */
export function getEyeFeats(
  eyes: { left: Eye; right: Eye },
  resizeWidth?: number,
  resizeHeight?: number
): number[] {
  const process = (eye: Eye) => {
    const resized = resizeEye(eye, resizeWidth, resizeHeight)
    const gray = grayscale(resized.patch, resized.width, resized.height)
    const hist: number[] = []
    equalizeHistogram(gray, 5, hist)
    return hist
  }

  if (params.trackEye == 'left') {
    return process(eyes.left)
  } else if (params.trackEye == 'right') {
    return process(eyes.right)
  } else {
    return process(eyes.left).concat(process(eyes.right))
  }
}

//Data Window class
//operates like an array but 'wraps' data around to keep the array at a fixed windowSize
/**
 * DataWindow class - Operates like an array, but 'wraps' data around to keep the array at a fixed windowSize
 * @param {Number} windowSize - defines the maximum size of the window
 * @param {Array} data - optional data to seed the DataWindow with
 **/
export class DataWindow<T> {
  private data: T[] = []
  private windowSize: number
  private index = 0
  public length = 0

  constructor(windowSize: number, data?: T[]) {
    this.windowSize = windowSize
    if (data) {
      this.data = data.slice(-windowSize)
      this.length = this.data.length
    }
  }

  public getData() {
    return this.data
  }

  public setData(data: T[]) {
    this.data = data
  }

  /**
   * [push description]
   * @param  {*} entry - item to be inserted. It either grows the DataWindow or replaces the oldest item
   * @return {DataWindow} this
   */
  push(entry: T): this {
    if (this.data.length < this.windowSize) {
      this.data.push(entry)
      this.length = this.data.length
      return this
    }

    this.data[this.index] = entry
    this.index = (this.index + 1) % this.windowSize
    return this
  }

  /**
   * Get the element at the ind position by wrapping around the DataWindow
   * @param  {Number} ind index of desired entry
   * @return {*}
   */
  get(ind: number): T | undefined {
    return this.data[this.getTrueIndex(ind)]
  }

  /**
   * Gets the true this.data array index given an index for a desired element
   * @param {Number} ind - index of desired entry
   * @return {Number} index of desired entry in this.data
   */
  private getTrueIndex(ind: number): number {
    if (this.data.length < this.windowSize) {
      return ind
    } else {
      return (ind + this.index) % this.windowSize
    }
  }

  /**
   * Append all the contents of data
   * @param {Array} data - to be inserted
   */
  addAll(data: T[]): void {
    for (const entry of data) {
      this.push(entry)
    }
  }
}

//Helper functions
/**
 * Grayscales an image patch. Can be used for the whole canvas, detected face, detected eye, etc.
 *
 * Code from tracking.js by Eduardo Lundgren, et al.
 * https://github.com/eduardolundgren/tracking.js/blob/master/src/tracking.js
 *
 * Software License Agreement (BSD License) Copyright (c) 2014, Eduardo A. Lundgren Melo. All rights reserved.
 * Redistribution and use of this software in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 * Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 * The name of Eduardo A. Lundgren Melo may not be used to endorse or promote products derived from this software without specific prior written permission of Eduardo A. Lundgren Melo.
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS “AS IS” AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 * IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION)
 * HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @param  {Array} pixels - image data to be grayscaled
 * @param  {Number} width  - width of image data to be grayscaled
 * @param  {Number} height - height of image data to be grayscaled
 * @return {Array} grayscaledImage
 */
export function grayscale(
  pixels: ImageData,
  width: number,
  height: number
): number[] {
  const gray: number[] = new Array(width * height)
  let p = 0
  let w = 0
  for (let i = 0; i < height; i++) {
    for (let j = 0; j < width; j++) {
      const value =
        pixels.data[w] * 0.299 +
        pixels.data[w + 1] * 0.587 +
        pixels.data[w + 2] * 0.114
      gray[p++] = value
      w += 4
    }
  }
  return gray
}

/**
 * Increase contrast of an image.
 *
 * Code from Martin Tschirsich, Copyright (c) 2012.
 * https://github.com/mtschirs/js-objectdetect/blob/gh-pages/js/objectdetect.js
 *
 * @param {Array} src - grayscale integer array
 * @param {Number} step - sampling rate, control performance
 * @param {Array} dst - array to hold the resulting image
 */
export function equalizeHistogram(
  src: number[],
  step: number = 5,
  dst: number[] = src
): number[] {
  const srcLength = src.length

  // Compute histogram and histogram sum:
  const hist = Array(256).fill(0)

  for (let i = 0; i < srcLength; i += step) {
    ++hist[src[i]]
  }

  // Compute integral histogram:
  const norm = (255 * step) / srcLength
  let prev = 0

  for (let i = 0; i < 256; ++i) {
    let h = hist[i]
    prev = h += prev
    hist[i] = h * norm // For non-integer src: ~~(h * norm + 0.5);
  }

  // Equalize image:
  for (let i = 0; i < srcLength; ++i) {
    dst[i] = hist[src[i]]
  }

  return dst
}

//not used !?
export function threshold(data, threshold) {
  for (let i = 0; i < data.length; i++) {
    data[i] = data[i] > threshold ? 255 : 0
  }
  return data
}

//not used !?
export function correlation(data1, data2) {
  const length = Math.min(data1.length, data2.length)
  let count = 0
  for (let i = 0; i < length; i++) {
    if (data1[i] === data2[i]) {
      count++
    }
  }
  return count / Math.max(data1.length, data2.length)
}

/**
 * Gets an Eye object and resizes it to the desired resolution
 * @param  {webgazer.util.Eye} eye - patch to be resized
 * @param  {Number} resizeWidth - desired width
 * @param  {Number} resizeHeight - desired height
 * @return {webgazer.util.Eye} resized eye patch
 */
export function resizeEye(
  eye: Eye,
  resizeWidth: number,
  resizeHeight: number
): Eye {
  const canvas = document.createElement('canvas')
  canvas.width = eye.width
  canvas.height = eye.height

  canvas.getContext('2d').putImageData(eye.patch, 0, 0)

  const tempCanvas = document.createElement('canvas')

  tempCanvas.width = resizeWidth
  tempCanvas.height = resizeHeight

  // save the canvas into temp canvas
  tempCanvas
    .getContext('2d')
    .drawImage(
      canvas,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      resizeWidth,
      resizeHeight
    )

  const resizedEye: Eye = {
    patch: tempCanvas
      .getContext('2d')
      .getImageData(0, 0, resizeWidth, resizeHeight),
    width: resizeWidth,
    height: resizeHeight,
    //TODO 沒有下面兩個參數
    imagex: 0,
    imagey: 0,
  }
  return resizedEye
}

/**
 * Checks if the prediction is within the boundaries of the viewport and constrains it
 * @param  {Array} prediction [x,y] - predicted gaze coordinates
 * @return {Array} constrained coordinates
 */
export function bound(prediction: Array<number>): Array<number> {
  if (prediction[0] < 0) {
    prediction[0] = 0
  }
  if (prediction[1] < 0) {
    prediction[1] = 0
  }
  const w = Math.max(
    document.documentElement.clientWidth,
    window.innerWidth || 0
  )
  const h = Math.max(
    document.documentElement.clientHeight,
    window.innerHeight || 0
  )
  if (prediction[0] > w) {
    prediction[0] = w
  }
  if (prediction[1] > h) {
    prediction[1] = h
  }
  return prediction
}

//not used !?
/**
 * Write statistics in debug paragraph panel
 * @param {HTMLElement} para - The <p> tag where write data
 * @param {Object} stats - The stats data to output
 */
export function debugBoxWrite(para: HTMLElement, stats: object) {
  var str = ''
  for (var key in stats) {
    str += key + ': ' + stats[key] + '\n'
  }
  para.innerText = str
}

//not used !?
/**
 * Constructor of DebugBox object,
 * it insert an paragraph inside a div to the body, in view to display debug data
 * @param {Number} interval - The log interval
 * @constructor
 */
type Stats = Record<string, any>

export class DebugBox {
  private para: HTMLParagraphElement
  private div: HTMLDivElement
  private buttons: Record<string, HTMLButtonElement> = {}
  private canvas: Record<string, HTMLCanvasElement> = {}
  private stats: Stats = {}

  constructor(interval?: number) {
    this.para = document.createElement('p')
    this.div = document.createElement('div')
    this.div.appendChild(this.para)
    document.body.appendChild(this.div)

    const updateInterval = interval || 300

    setInterval(() => {
      this.debugBoxWrite(this.para, this.stats)
    }, updateInterval)
  }

  //not used !?
  /**
   * Add stat data for log
   * @param {String} key - The data key
   * @param {*} value - The value
   */
  public set(key: string, value: any): void {
    this.stats[key] = value
  }

  //not used !?
  /**
   * Initialize stats in case where key does not exist, else
   * increment value for key
   * @param {String} key - The key to process
   * @param {Number} incBy - Value to increment for given key (default: 1)
   * @param {Number} init - Initial value in case where key does not exist (default: 0)
   */
  public inc(key: string, incBy: number = 1, init: number = 0): void {
    if (!this.stats[key]) {
      this.stats[key] = init
    }
    this.stats[key] += incBy
  }

  //not used !?
  /**
   * Create a button and register the given function to the button click event
   * @param {String} name - The button name to link
   * @param {Function} func - The onClick callback
   */
  public addButton(name: string, func: () => void): void {
    if (!this.buttons[name]) {
      this.buttons[name] = document.createElement('button')
      this.div.appendChild(this.buttons[name])
    }
    const button = this.buttons[name]
    button.addEventListener('click', func)
    button.innerText = name
  }

  //not used !?
  /**
   * Search for a canvas elemenet with name, or create on if not exist.
   * Then send the canvas element as callback parameter.
   * @param {String} name - The canvas name to send/create
   * @param {Function} func - The callback function where send canvas
   */
  public show(name: string, func: (canvas: HTMLCanvasElement) => void): void {
    if (!this.canvas[name]) {
      this.canvas[name] = document.createElement('canvas')
      this.div.appendChild(this.canvas[name])
    }
    const canvas = this.canvas[name]
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    func(canvas)
  }

  private debugBoxWrite(para: HTMLElement, stats: Stats): void {
    let str = ''
    for (const key in stats) {
      str += `${key}: ${stats[key]}\n`
    }
    para.innerText = str
  }
}

// export default util
