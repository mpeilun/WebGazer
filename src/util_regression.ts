import numeric from 'numeric'
import mat from './mat'
import params from './params'
import { DataWindow, getEyeFeats } from './util'

// const util_regression = {}

/**
 * Initialize new arrays and initialize Kalman filter for regressions.
 */
export function InitRegression() {
  var dataWindow = 700
  var trailDataWindow = 10
  this.ridgeParameter = Math.pow(10, -5)
  this.errorXArray = new DataWindow(dataWindow)
  this.errorYArray = new DataWindow(dataWindow)

  this.screenXClicksArray = new DataWindow(dataWindow)
  this.screenYClicksArray = new DataWindow(dataWindow)
  this.eyeFeaturesClicks = new DataWindow(dataWindow)

  //sets to one second worth of cursor trail
  this.trailTime = 1000
  this.trailDataWindow = this.trailTime / params.moveTickSize
  this.screenXTrailArray = new DataWindow(trailDataWindow)
  this.screenYTrailArray = new DataWindow(trailDataWindow)
  this.eyeFeaturesTrail = new DataWindow(trailDataWindow)
  this.trailTimes = new DataWindow(trailDataWindow)

  this.dataClicks = new DataWindow(dataWindow)
  this.dataTrail = new DataWindow(trailDataWindow)

  // Initialize Kalman filter [20200608 xk] what do we do about parameters?
  // [20200611 xk] unsure what to do w.r.t. dimensionality of these matrices. So far at least
  //               by my own anecdotal observation a 4x1 x vector seems to work alright
  var F = [
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ]

  //Parameters Q and R may require some fine tuning
  var Q = [
    [1 / 4, 0, 1 / 2, 0],
    [0, 1 / 4, 0, 1 / 2],
    [1 / 2, 0, 1, 0],
    [0, 1 / 2, 0, 1],
  ] // * delta_t
  var delta_t = 1 / 10 // The amount of time between frames
  Q = numeric.mul(Q, delta_t)

  var H = [
    [1, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
  ]
  var H = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
  ]
  var pixel_error = 47 //We will need to fine tune this value [20200611 xk] I just put a random value here

  //This matrix represents the expected measurement error
  var R = numeric.mul(numeric.identity(2), pixel_error)

  var P_initial = numeric.mul(numeric.identity(4), 0.0001) //Initial covariance matrix
  var x_initial = [[500], [500], [0], [0]] // Initial measurement matrix

  this.kalman = new KalmanFilter(F, H, Q, R, P_initial, x_initial)
}

/**
 * Kalman Filter constructor
 * Kalman filters work by reducing the amount of noise in a models.
 * https://blog.cordiner.net/2011/05/03/object-tracking-using-a-kalman-filter-matlab/
 *
 * @param {Array.<Array.<Number>>} F - transition matrix
 * @param {Array.<Array.<Number>>} Q - process noise matrix
 * @param {Array.<Array.<Number>>} H - maps between measurement vector and noise matrix
 * @param {Array.<Array.<Number>>} R - defines measurement error of the device
 * @param {Array} P_initial - the initial state
 * @param {Array} X_initial - the initial state of the device
 */
type Matrix = Array<Array<number>>

class KalmanFilter {
  F: Matrix // State transition matrix
  Q: Matrix // Process noise matrix
  H: Matrix // Transformation matrix
  R: Matrix // Measurement Noise
  P: Matrix // Initial covariance matrix
  X: number[][] // Initial guess of measurement

  constructor(
    F: Matrix,
    Q: Matrix,
    H: Matrix,
    R: Matrix,
    P_initial: Matrix,
    X_initial: number[][]
  ) {
    this.F = F
    this.Q = Q
    this.H = H
    this.R = R
    this.P = P_initial
    this.X = X_initial
  }

  update(z: Array<number>): Array<number> {
    const add = numeric.add
    const sub = numeric.sub
    const inv = numeric.inv
    const identity = numeric.identity
    const mult = mat.mult
    const transpose = mat.transpose

    // Prediction step
    const X_p = mult(this.F, this.X)
    const P_p = add(mult(mult(this.F, this.P), transpose(this.F)), this.Q)

    // Calculate the update values
    const y = sub(z, mult(this.H, X_p))
    const S = add(mult(mult(this.H, P_p), transpose(this.H)), this.R)

    // Kalman gain calculation
    const K = mult(P_p, mult(transpose(this.H), inv(S)))

    // Convert y into column vector form
    const y_col = y.map((val) => [val])

    // Correction step
    this.X = add(X_p, mult(K, y_col))
    this.P = mult(sub(identity(K.length), mult(K, this.H)), P_p)

    // Return the predicted state in its measurement form
    return transpose(mult(this.H, this.X))[0]
  }
}

/**
 * Performs ridge regression, according to the Weka code.
 * @param {Array} y - corresponds to screen coordinates (either x or y) for each of n click events
 * @param {Array.<Array.<Number>>} X - corresponds to gray pixel features (120 pixels for both eyes) for each of n clicks
 * @param {Array} k - ridge parameter
 * @return{Array} regression coefficients
 */
function ridge(y: number[], X: number[][], k: number): number[][] {
  const nc = X[0].length
  let m_Coefficients: number[][] = new Array<number[]>(nc)
  const xt = numeric.transpose(X)
  let solution: number[][] = []
  let success = true

  do {
    const ss = numeric.dot(xt, X)

    // Set ridge regression adjustment
    for (let i = 0; i < nc; i++) {
      ss[i][i] += k
    }

    // Carry out the regression
    const bb = numeric.dot(xt, y)
    for (let i = 0; i < nc; i++) {
      m_Coefficients[i] = bb[i]
    }

    try {
      const n =
        m_Coefficients.length !== 0
          ? m_Coefficients.length / m_Coefficients.length
          : 0
      if (m_Coefficients.length * n !== m_Coefficients.length) {
        throw new Error('Array length must be a multiple of m')
      }

      solution =
        ss.length === ss[0].length
          ? numeric.solve(numeric.LU(ss, true), bb)
          : webgazer.mat.QRDecomposition(ss, bb)

      m_Coefficients = solution

      success = true
    } catch (ex) {
      k *= 10
      console.log(ex)
      success = false
    }
  } while (!success)

  return m_Coefficients
}

/**
 * Add given data to current data set then,
 * replace current data member with given data
 * @param {Array.<Object>} data - The data to set
 */
export function setData(data) {
  for (var i = 0; i < data.length; i++) {
    // Clone data array
    var leftData = new Uint8ClampedArray(data[i].eyes.left.patch.data)
    var rightData = new Uint8ClampedArray(data[i].eyes.right.patch.data)
    // Duplicate ImageData object
    data[i].eyes.left.patch = new ImageData(
      leftData,
      data[i].eyes.left.width,
      data[i].eyes.left.height
    )
    data[i].eyes.right.patch = new ImageData(
      rightData,
      data[i].eyes.right.width,
      data[i].eyes.right.height
    )

    // Add those data objects to model
    this.addData(data[i].eyes, data[i].screenPos, data[i].type)
  }
}

//not used ?!
//TODO: still usefull ???
/**
 *
 * @returns {Number}
 */
function getCurrentFixationIndex(): number {
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

export function addData(eyes, screenPos, type) {
  if (!eyes) {
    return
  }
  //not doing anything with blink at present
  // if (eyes.left.blink || eyes.right.blink) {
  //     return;
  // }
  if (type === 'click') {
    this.screenXClicksArray.push([screenPos[0]])
    this.screenYClicksArray.push([screenPos[1]])
    this.eyeFeaturesClicks.push(getEyeFeats(eyes))
    this.dataClicks.push({ eyes: eyes, screenPos: screenPos, type: type })
  } else if (type === 'move') {
    this.screenXTrailArray.push([screenPos[0]])
    this.screenYTrailArray.push([screenPos[1]])

    this.eyeFeaturesTrail.push(getEyeFeats(eyes))
    this.trailTimes.push(performance.now())
    this.dataTrail.push({ eyes: eyes, screenPos: screenPos, type: type })
  }

  // [20180730 JT] Why do we do this? It doesn't return anything...
  // But as JS is pass by reference, it still affects it.
  //
  // Causes problems for when we want to call 'addData' twice in a row on the same object, but perhaps with different screenPos or types (think multiple interactions within one video frame)
  //eyes.left.patch = Array.from(eyes.left.patch.data);
  //eyes.right.patch = Array.from(eyes.right.patch.data);
}

// export default util_regression
