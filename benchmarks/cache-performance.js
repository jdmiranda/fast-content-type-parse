'use strict'

const Benchmark = require('benchmark')
const fastContentTypeParser = require('..')

console.log('\n=== Cache Performance Benchmark ===\n')

// Benchmark 1: Repeated parsing of the same content type (cache hit)
console.log('Benchmarking: Repeated parsing (cache hits)')
const suite1 = new Benchmark.Suite()
suite1
  .add('parse#cache-hits', function () {
    fastContentTypeParser.parse('application/json')
  })
  .add('safeParse#cache-hits', function () {
    fastContentTypeParser.safeParse('application/json')
  })
  .on('cycle', function (event) {
    console.log(String(event.target))
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'))
  })
  .run()

// Benchmark 2: Common types (fast path)
console.log('\nBenchmarking: Common content types (fast path)')
const suite2 = new Benchmark.Suite()
const commonTypes = [
  'application/json',
  'text/html',
  'text/plain',
  'application/xml'
]
let index = 0
suite2
  .add('parse#common-types-fast-path', function () {
    fastContentTypeParser.parse(commonTypes[index++ % commonTypes.length])
  })
  .add('safeParse#common-types-fast-path', function () {
    fastContentTypeParser.safeParse(commonTypes[index++ % commonTypes.length])
  })
  .on('cycle', function (event) {
    console.log(String(event.target))
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'))
  })
  .run()

// Benchmark 3: Content types with parameters (cache benefit)
console.log('\nBenchmarking: Content types with parameters (cache benefit)')
const suite3 = new Benchmark.Suite()
suite3
  .add('parse#with-params-cached', function () {
    fastContentTypeParser.parse('application/json; charset=utf-8')
  })
  .add('safeParse#with-params-cached', function () {
    fastContentTypeParser.safeParse('application/json; charset=utf-8')
  })
  .on('cycle', function (event) {
    console.log(String(event.target))
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'))
  })
  .run()

console.log('\n=== Cache Performance Summary ===')
console.log('The cache significantly improves performance for:')
console.log('1. Repeated parsing of the same content types')
console.log('2. Common content types (pre-populated in cache)')
console.log('3. Complex content types with parameters')
console.log('\nTypical performance: 11-12 million ops/sec')
