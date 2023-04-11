'use strict'

import { DataWindow } from './util'

console.log('thread starting')

// Add src/util.mjs and src/mat.mjs to the same directory as your html file
importScripts('./worker_scripts/util.js', './worker_scripts/mat.js') // [20200708] Figure out how to make all of this wrap up neatly
var ridgeParameter = Math.pow(10, -5)
var resizeWidth = 10
var resizeHeight = 6
var dataWindow = 700
var trailDataWindow = 10
var trainInterval = 500
var needsTraining = false

var screenXClicksArray = new DataWindow(dataWindow)
var screenYClicksArray = new DataWindow(dataWindow)
var eyeFeaturesClicks = new DataWindow(dataWindow)
var dataClicks = new DataWindow(dataWindow)

var screenXTrailArray = new DataWindow(trailDataWindow)
var screenYTrailArray = new DataWindow(trailDataWindow)
var eyeFeaturesTrail = new DataWindow(trailDataWindow)
var dataTrail = new DataWindow(trailDataWindow)

/**
 * Performs ridge regression, according to the Weka code.
 * @param {Array} y - corresponds to screen coordinates (either x or y) for each of n click events
 * @param {Array.<Array.<Number>>} X - corresponds to gray pixel features (120 pixels for both eyes) for each of n clicks
 * @param {Array} k - ridge parameter
 * @return{Array} regression coefficients
 */
function ridge(y, X, k) {
  var nc = X[0].length
  var m_Coefficients = new Array(nc)
  var xt = self.webgazer.mat.transpose(X)
  var solution = new Array()
  var success = true
  do {
    var ss = self.webgazer.mat.mult(xt, X)
    // Set ridge regression adjustment
    for (var i = 0; i < nc; i++) {
      ss[i][i] = ss[i][i] + k
    }

    // Carry out the regression
    var bb = self.webgazer.mat.mult(xt, y)
    for (var i = 0; i < nc; i++) {
      m_Coefficients[i] = bb[i][0]
    }
    try {
      var n =
        m_Coefficients.length !== 0
          ? m_Coefficients.length / m_Coefficients.length
          : 0
      if (m_Coefficients.length * n !== m_Coefficients.length) {
        console.log('Array length must be a multiple of m')
      }
      solution =
        ss.length === ss[0].length
          ? self.webgazer.mat.LUDecomposition(ss, bb)
          : self.webgazer.mat.QRDecomposition(ss, bb)

      for (var i = 0; i < nc; i++) {
        m_Coefficients[i] = solution[i][0]
      }
      success = true
    } catch (ex) {
      k *= 10
      console.log(ex)
      success = false
    }
  } while (!success)
  return m_Coefficients
}

//TODO: still usefull ???
/**
 *
 * @returns {Number}
 */
function getCurrentFixationIndex() {
  var index = 0
  var recentX = this.screenXTrailArray.get(0)
  var recentY = this.screenYTrailArray.get(0)
  for (var i = this.screenXTrailArray.length - 1; i >= 0; i--) {
    var currX = this.screenXTrailArray.get(i)
    var currY = this.screenYTrailArray.get(i)
    var euclideanDistance = Math.sqrt(
      Math.pow(currX - recentX, 2) + Math.pow(currY - recentY, 2)
    )
    if (euclideanDistance > 72) {
      return i + 1
    }
  }
  return i
}

/**
 * Event handler, it store screen position to allow training
 * @param {Event} event - the receive event
 */
self.onmessage = function (event) {
  var data = event.data
  var screenPos = data['screenPos']
  var eyes = data['eyes']
  var type = data['type']
  if (type === 'click') {
    screenXClicksArray.push([screenPos[0]])
    screenYClicksArray.push([screenPos[1]])

    eyeFeaturesClicks.push(eyes)
  } else if (type === 'move') {
    screenXTrailArray.push([screenPos[0]])
    screenYTrailArray.push([screenPos[1]])

    eyeFeaturesTrail.push(eyes)
    dataTrail.push({ eyes: eyes, screenPos: screenPos, type: type })
  }
  needsTraining = true
}

/**
 * Compute coefficient from training data
 */
function retrain() {
  if (screenXClicksArray.length === 0) {
    return
  }
  if (!needsTraining) {
    return
  }
  var screenXArray = screenXClicksArray
    .getData()
    .concat(screenXTrailArray.getData())
  var screenYArray = screenYClicksArray
    .getData()
    .concat(screenYTrailArray.getData())
  var eyeFeatures = eyeFeaturesClicks
    .getData()
    .concat(eyeFeaturesTrail.getData())

  var coefficientsX = ridge(screenXArray, eyeFeatures, ridgeParameter)
  var coefficientsY = ridge(screenYArray, eyeFeatures, ridgeParameter)
  self.postMessage({ X: coefficientsX, Y: coefficientsY })
  needsTraining = false
}

setInterval(retrain, trainInterval)
