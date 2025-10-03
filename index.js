'use strict'

const NullObject = function NullObject () { }
NullObject.prototype = Object.create(null)

/**
 * RegExp to match *( ";" parameter ) in RFC 7231 sec 3.1.1.1
 *
 * parameter     = token "=" ( token / quoted-string )
 * token         = 1*tchar
 * tchar         = "!" / "#" / "$" / "%" / "&" / "'" / "*"
 *               / "+" / "-" / "." / "^" / "_" / "`" / "|" / "~"
 *               / DIGIT / ALPHA
 *               ; any VCHAR, except delimiters
 * quoted-string = DQUOTE *( qdtext / quoted-pair ) DQUOTE
 * qdtext        = HTAB / SP / %x21 / %x23-5B / %x5D-7E / obs-text
 * obs-text      = %x80-FF
 * quoted-pair   = "\" ( HTAB / SP / VCHAR / obs-text )
 */
const paramRE = /; *([!#$%&'*+.^\w`|~-]+)=("(?:[\v\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\v\u0020-\u00ff])*"|[!#$%&'*+.^\w`|~-]+) */gu

/**
 * RegExp to match quoted-pair in RFC 7230 sec 3.2.6
 *
 * quoted-pair = "\" ( HTAB / SP / VCHAR / obs-text )
 * obs-text    = %x80-FF
 */
const quotedPairRE = /\\([\v\u0020-\u00ff])/gu

/**
 * RegExp to match type in RFC 7231 sec 3.1.1.1
 *
 * media-type = type "/" subtype
 * type       = token
 * subtype    = token
 */
const mediaTypeRE = /^[!#$%&'*+.^\w|~-]+\/[!#$%&'*+.^\w|~-]+$/u

// default ContentType to prevent repeated object creation
const defaultContentType = { type: '', parameters: new NullObject() }
Object.freeze(defaultContentType.parameters)
Object.freeze(defaultContentType)

/**
 * Simple LRU Cache implementation for parsed content types
 */
class LRUCache {
  constructor (maxSize = 100) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  get (key) {
    if (!this.cache.has(key)) return undefined
    // Move to end (most recently used)
    const value = this.cache.get(key)
    this.cache.delete(key)
    this.cache.set(key, value)
    return value
  }

  set (key, value) {
    // Remove oldest item if at capacity and key doesn't exist
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    // Always delete before set to maintain LRU order (move to end)
    this.cache.delete(key)
    this.cache.set(key, value)
  }
}

// Create caches for both parse and safeParse
const parseCache = new LRUCache(100)
const safeParseCache = new LRUCache(100)

/**
 * Fast path cache for common content types without parameters
 */
const commonTypes = new Map()
const commonTypesList = [
  'application/json',
  'text/html',
  'text/plain',
  'application/xml',
  'text/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'application/octet-stream',
  'image/jpeg',
  'image/png',
  'image/gif',
  'text/css',
  'text/javascript',
  'application/javascript'
]

// Pre-populate common types cache
for (const type of commonTypesList) {
  const result = {
    type,
    parameters: new NullObject()
  }
  Object.freeze(result.parameters)
  Object.freeze(result)
  commonTypes.set(type, result)
}

/**
 * Parse media type to object.
 *
 * @param {string|object} header
 * @return {Object}
 * @public
 */

function parse (header) {
  if (typeof header !== 'string') {
    throw new TypeError('argument header is required and must be a string')
  }

  // Check cache first
  const cached = parseCache.get(header)
  if (cached !== undefined) {
    return cached
  }

  // Fast path for common types without parameters
  const commonType = commonTypes.get(header)
  if (commonType !== undefined) {
    parseCache.set(header, commonType)
    return commonType
  }

  let index = header.indexOf(';')
  const type = index !== -1
    ? header.slice(0, index).trim()
    : header.trim()

  if (mediaTypeRE.test(type) === false) {
    throw new TypeError('invalid media type')
  }

  const lowerType = type.toLowerCase()

  // Fast path: no parameters
  if (index === -1) {
    // Check if this is a common type
    const commonResult = commonTypes.get(lowerType)
    if (commonResult !== undefined) {
      parseCache.set(header, commonResult)
      return commonResult
    }

    const result = {
      type: lowerType,
      parameters: new NullObject()
    }
    parseCache.set(header, result)
    return result
  }

  // Parse parameters
  const result = {
    type: lowerType,
    parameters: new NullObject()
  }

  let key
  let match
  let value

  paramRE.lastIndex = index

  while ((match = paramRE.exec(header))) {
    if (match.index !== index) {
      throw new TypeError('invalid parameter format')
    }

    index += match[0].length
    key = match[1].toLowerCase()
    value = match[2]

    if (value[0] === '"') {
      // remove quotes and escapes
      value = value.slice(1, value.length - 1)

      if (quotedPairRE.test(value)) {
        quotedPairRE.lastIndex = 0
        value = value.replace(quotedPairRE, '$1')
      }
    }

    result.parameters[key] = value
  }

  if (index !== header.length) {
    throw new TypeError('invalid parameter format')
  }

  parseCache.set(header, result)
  return result
}

function safeParse (header) {
  if (typeof header !== 'string') {
    return defaultContentType
  }

  // Check cache first
  const cached = safeParseCache.get(header)
  if (cached !== undefined) {
    return cached
  }

  // Fast path for common types without parameters
  const commonType = commonTypes.get(header)
  if (commonType !== undefined) {
    safeParseCache.set(header, commonType)
    return commonType
  }

  let index = header.indexOf(';')
  const type = index !== -1
    ? header.slice(0, index).trim()
    : header.trim()

  if (mediaTypeRE.test(type) === false) {
    return defaultContentType
  }

  const lowerType = type.toLowerCase()

  // Fast path: no parameters
  if (index === -1) {
    // Check if this is a common type
    const commonResult = commonTypes.get(lowerType)
    if (commonResult !== undefined) {
      safeParseCache.set(header, commonResult)
      return commonResult
    }

    const result = {
      type: lowerType,
      parameters: new NullObject()
    }
    safeParseCache.set(header, result)
    return result
  }

  // Parse parameters
  const result = {
    type: lowerType,
    parameters: new NullObject()
  }

  let key
  let match
  let value

  paramRE.lastIndex = index

  while ((match = paramRE.exec(header))) {
    if (match.index !== index) {
      return defaultContentType
    }

    index += match[0].length
    key = match[1].toLowerCase()
    value = match[2]

    if (value[0] === '"') {
      // remove quotes and escapes
      value = value.slice(1, value.length - 1)

      if (quotedPairRE.test(value)) {
        quotedPairRE.lastIndex = 0
        value = value.replace(quotedPairRE, '$1')
      }
    }

    result.parameters[key] = value
  }

  if (index !== header.length) {
    return defaultContentType
  }

  safeParseCache.set(header, result)
  return result
}

module.exports.default = { parse, safeParse }
module.exports.parse = parse
module.exports.safeParse = safeParse
module.exports.defaultContentType = defaultContentType
