'use strict'

const fs = require('fs')
const path = require('path')
const SVGO = require('svgo')
const opentype = require('opentype.js')
const extract = require('extract-svg-path')
const parse = require('parse-svg-path')
const abs = require('abs-svg-path')
const normalize = require('normalize-svg-path')
const bezier = require('adaptive-bezier-curve')
const simplify = require('simplify-path')

function SVG () {
  const defaultFont = opentype.loadSync(path.join(__dirname, 'cambam_stick_3.ttf'))
  const svgo = new SVGO({
    plugins: [
    {convertShapeToPath: true},
      {convertPathData: {
        straightCurves: false,
        lineShorthands: false,
        curveSmoothShorthands: false,
        floatPrecision: 3,
        transformPrecision: 5,
        removeUseless: true,
        collapseRepeated: true,
        utilizeAbsolute: true,
        leadingZero: true,
        negativeExtraSpace: true
      }}
    ]
  })

  const api = {
    fromFile: (filePath, scale = 2) => {
      let file = fs.readFileSync(filePath, 'utf8')
      let points = []
      svgo.optimize(file, (result) => {
        points = svgStringToPoints(result.data, scale)
      })
      return clean(points)
    },

    fromText: (str, x, y, _opts) => {
      const opts = Object.assign({
        fontSize: 10,
        fontFile: null
      }, _opts)

      // @TODO: font file caching
      let font = opts.fontFile ? opentype.loadSync(opts.fontFile) : defaultFont
      let svgString = font.getPath(str, x, y, opts.fontSize).toSVG()
      let points = svgStringToPoints(svgString)
      return clean(points)
    },

    getAABB: (points) => {
      if (points && points.length > 0) {
        let min = {x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY}
        let max = {x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY}
        for (let i = 0; i < points.length; i++) {
          let point = points[i]
          if (point[0] !== 'M') {
            let x = point[0]
            let y = point[1]
            if (x < min.x) min.x = x
            else if (x > max.x) max.x = x

            if (y < min.y) min.y = y
            else if (y > max.y) max.y = y
          }
        }

        let w = Math.abs(max.x - min.x)
        let h = Math.abs(max.y - min.y)

        return {
          x: min.x,
          y: min.y,
          center: {x: min.x + w / 2, y: min.y + h / 2},
          width: w,
          height: h
        }
      } else return null
    }
  }

  return api

  function svgStringToPoints (svgString, scale = 2) {
    let points = []
    if (svgString) {
      let paths = sanitize(svgString)
      for (let i = 0, ppos; i < paths.length; i++) {
        let path = paths[i]
        if (path[0] === 'M') {
          points.push(path)
          ppos = [path[1], path[2]]
        } else if (path[0] === 'L') {
          let start = [path[1], path[2]]
          let end = [path[3], path[4]]
          points.push(start)
          points.push(end)
          ppos = end
        } else if (ppos && path[0] === 'C') {
          let start = ppos
          let c1 = [path[1], path[2]]
          let c2 = [path[3], path[4]]
          let end = [path[5], path[6]]

          points = points.concat(bezier(start, c1, c2, end, scale))
          ppos = end
        }
      }
    }
    return points
  }

  function sanitize (svgString) {
    let extracted = extract.parse(svgString)
    let parsed = parse(extracted)
    let absed = abs(parsed)
    return normalize(absed)
  }

  function clean (points, tolerance = 0) {
    let cleaned = []
    let line = []
    for (let i = 0; i < points.length; i++) {
      let point = points[i]
      if (point[0] === 'M') {
        if (line.length > 0) {
          cleaned = cleaned.concat(simplify(line, tolerance))
          line = []
        }
        cleaned.push(point)
      } else line.push(point)
    }

    if (line.length > 0) cleaned = cleaned.concat(simplify(line, tolerance))
    return cleaned
  }
}

module.exports = SVG
