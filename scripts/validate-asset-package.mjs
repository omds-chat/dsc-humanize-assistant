/*
 * 资产包校验脚本:零依赖,只使用 Node 内置模块。
 *
 * 用法:
 *   node scripts/validate-asset-package.mjs <包目录> [更多包目录]
 *   node scripts/validate-asset-package.mjs --json <包目录>
 *   node scripts/validate-asset-package.mjs --self-test
 *
 * 退出码:0 全部通过;1 存在不合规的包;2 用法错误或读取失败。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SPEC_VERSION_FILE = 'specs/spec-version.json'
const METADATA_FILE = 'asset.json'
const CONTENT_TYPES = ['persona', 'labels', 'strategies', 'injection']
const CONTENT_TYPE_SET = new Set(CONTENT_TYPES)
const TYPE_LABELS = {
  persona: '人物设定',
  labels: '分类标签集',
  strategies: '策略规则',
  injection: '注入文本',
}
const ALLOWED_ROOT_FILES = new Set([METADATA_FILE, 'README.md'])
const SUPPORTED_KEYWORDS = new Set([
  '$schema',
  '$id',
  '$comment',
  '$defs',
  '$ref',
  'title',
  'description',
  'type',
  'properties',
  'required',
  'additionalProperties',
  'pattern',
  'minLength',
  'maxLength',
  'enum',
  'const',
  'items',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'examples',
  'default',
  'deprecated',
])

/* ---------- 通用工具 ---------- */

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const typeOf = (value) => {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

const matchesType = (value, type) => {
  if (type === 'integer') {
    return typeof value === 'number' && Number.isInteger(value)
  }
  if (type === 'number') {
    return typeof value === 'number'
  }
  return typeOf(value) === type
}

const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right)

const stripBom = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)

const issue = (code, at, message) => ({ code, path: at, message })

const patternCache = new Map()

const compilePattern = (pattern) => {
  if (patternCache.has(pattern)) {
    return patternCache.get(pattern)
  }
  let compiled = null
  try {
    compiled = new RegExp(pattern)
  } catch {
    compiled = null
  }
  patternCache.set(pattern, compiled)
  return compiled
}

const resolvePointer = (ref, document) => {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) {
    return undefined
  }
  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))
  let node = document
  for (const segment of segments) {
    if (!isObject(node) && !Array.isArray(node)) {
      return undefined
    }
    node = node[segment]
    if (node === undefined) {
      return undefined
    }
  }
  return node
}

/* ---------- JSON Schema 子集校验 ---------- */

const collectKeywords = (node, found) => {
  if (Array.isArray(node)) {
    node.forEach((item) => collectKeywords(item, found))
    return
  }
  if (!isObject(node)) {
    return
  }
  Object.keys(node).forEach((key) => {
    if (key === 'properties' || key === '$defs' || key === 'patternProperties') {
      Object.values(node[key]).forEach((child) => collectKeywords(child, found))
      return
    }
    found.add(key)
    if (key === 'items' || key === 'additionalProperties' || key === 'not' || key === 'if' || key === 'then' || key === 'else' || key === 'allOf' || key === 'anyOf' || key === 'oneOf') {
      collectKeywords(node[key], found)
    }
  })
}

const assertSupportedKeywords = (name, schema) => {
  const found = new Set()
  collectKeywords(schema, found)
  const unknown = [...found].filter((key) => !SUPPORTED_KEYWORDS.has(key) && !/^\d+$/.test(key))
  if (unknown.length > 0) {
    throw new Error('Schema ' + name + ' 使用了校验脚本尚未支持的关键字: ' + unknown.join('、'))
  }
}

const validateSchema = (schema, value, at, root, code, issues, depth) => {
  if (schema === true) {
    return
  }
  if (schema === false) {
    issues.push(issue(code, at, '该位置不允许出现任何值'))
    return
  }
  if (!isObject(schema)) {
    issues.push(issue('schema-defect', at, '子 schema 必须是对象或布尔值'))
    return
  }
  if (depth > 32) {
    issues.push(issue('schema-defect', at, '$ref 嵌套过深'))
    return
  }
  if (schema.$ref !== undefined) {
    const target = resolvePointer(schema.$ref, root)
    if (target === undefined) {
      issues.push(issue('schema-defect', at, '无法解析 $ref ' + schema.$ref))
      return
    }
    validateSchema(target, value, at, root, code, issues, depth + 1)
  }
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type]
    if (!types.some((type) => matchesType(value, type))) {
      issues.push(issue(code, at, '类型应为 ' + types.join(' 或 ') + ',实际为 ' + typeOf(value)))
      return
    }
  }
  if (schema.const !== undefined && !sameValue(schema.const, value)) {
    issues.push(issue(code, at, '取值必须是 ' + JSON.stringify(schema.const)))
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => sameValue(item, value))) {
    issues.push(
      issue(code, at, '取值必须是 ' + schema.enum.map((item) => JSON.stringify(item)).join('、') + ' 之一,实际为 ' + JSON.stringify(value)),
    )
  }
  if (typeof value === 'string') {
    const length = [...value].length
    if (schema.minLength !== undefined && length < schema.minLength) {
      issues.push(issue(code, at, '长度不得小于 ' + String(schema.minLength)))
    }
    if (schema.maxLength !== undefined && length > schema.maxLength) {
      issues.push(issue(code, at, '长度不得大于 ' + String(schema.maxLength)))
    }
    if (schema.pattern !== undefined) {
      const compiled = compilePattern(schema.pattern)
      if (compiled === null) {
        issues.push(issue('schema-defect', at, 'schema 的 pattern 无法编译: ' + schema.pattern))
      } else if (!compiled.test(value)) {
        issues.push(issue(code, at, JSON.stringify(value) + ' 不符合 ' + schema.pattern))
      }
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      issues.push(issue(code, at, '不得小于 ' + String(schema.minimum)))
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      issues.push(issue(code, at, '不得大于 ' + String(schema.maximum)))
    }
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
      issues.push(issue(code, at, '必须大于 ' + String(schema.exclusiveMinimum)))
    }
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
      issues.push(issue(code, at, '必须小于 ' + String(schema.exclusiveMaximum)))
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      issues.push(issue(code, at, '至少需要 ' + String(schema.minItems) + ' 项,实际为 ' + String(value.length) + ' 项'))
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      issues.push(issue(code, at, '最多允许 ' + String(schema.maxItems) + ' 项,实际为 ' + String(value.length) + ' 项'))
    }
    if (schema.uniqueItems === true) {
      const seen = new Set()
      value.forEach((item, index) => {
        const key = JSON.stringify(item)
        if (seen.has(key)) {
          issues.push(issue(code, at + '/' + String(index), '取值与前面重复: ' + key))
        }
        seen.add(key)
      })
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => {
        validateSchema(schema.items, item, at + '/' + String(index), root, code, issues, depth + 1)
      })
    }
  }
  if (isObject(value)) {
    const properties = isObject(schema.properties) ? schema.properties : {}
    if (Array.isArray(schema.required)) {
      schema.required.forEach((name) => {
        if (!Object.prototype.hasOwnProperty.call(value, name)) {
          issues.push(issue(code, at + '/' + name, '缺少必填字段'))
        }
      })
    }
    Object.keys(value).forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(properties, key)) {
        validateSchema(properties[key], value[key], at + '/' + key, root, code, issues, depth + 1)
        return
      }
      if (schema.additionalProperties === false) {
        issues.push(issue(code, at + '/' + key, '不允许出现该字段;字段集合见规范第五节与第七节'))
        return
      }
      if (isObject(schema.additionalProperties)) {
        validateSchema(schema.additionalProperties, value[key], at + '/' + key, root, code, issues, depth + 1)
      }
    })
  }
}

/* ---------- 规范区与 Schema ---------- */

const readJson = (relPath) => JSON.parse(stripBom(readFileSync(path.join(ROOT, relPath), 'utf8')))

const loadSpec = () => {
  if (!existsSync(path.join(ROOT, SPEC_VERSION_FILE))) {
    throw new Error('缺少 ' + SPEC_VERSION_FILE)
  }
  const spec = readJson(SPEC_VERSION_FILE)
  const required = ['package', 'persona', 'labels', 'strategies', 'injection']
  required.forEach((key) => {
    if (!isObject(spec.schemas) || typeof spec.schemas[key] !== 'string') {
      throw new Error(SPEC_VERSION_FILE + ' 缺少 schemas.' + key)
    }
  })
  const schemas = {}
  required.forEach((key) => {
    const relPath = spec.schemas[key]
    if (!existsSync(path.join(ROOT, relPath))) {
      throw new Error('Schema 文件不存在: ' + relPath)
    }
    schemas[key] = readJson(relPath)
    assertSupportedKeywords(relPath, schemas[key])
  })
  const declaredTypes = schemas.package.$defs && schemas.package.$defs.contentType && schemas.package.$defs.contentType.enum
  if (!Array.isArray(declaredTypes) || declaredTypes.join(',') !== CONTENT_TYPES.join(',')) {
    throw new Error('元数据 Schema 的类型枚举与本脚本的类型集合不一致: ' + JSON.stringify(declaredTypes))
  }
  if (typeof spec.format_version !== 'string' || !/^\d+\.\d+\.\d+$/.test(spec.format_version)) {
    throw new Error(SPEC_VERSION_FILE + ' 的 format_version 必须是三段数字')
  }
  return { spec, schemas }
}

/* ---------- 包的读取与内存构造 ---------- */

const emptyTree = () => ({ files: new Map(), dirs: new Set(), rootEntries: new Map() })

const readPackageTree = (dir) => {
  const tree = emptyTree()
  readdirSync(dir)
    .sort()
    .forEach((name) => {
      const abs = path.join(dir, name)
      const stat = statSync(abs)
      if (stat.isDirectory()) {
        tree.dirs.add(name)
        tree.rootEntries.set(name, 'dir')
        readdirSync(abs)
          .sort()
          .forEach((child) => {
            const childAbs = path.join(abs, child)
            if (statSync(childAbs).isDirectory()) {
              tree.dirs.add(name + '/' + child)
              return
            }
            tree.files.set(name + '/' + child, readFileSync(childAbs, 'utf8'))
          })
        return
      }
      if (stat.isFile()) {
        tree.rootEntries.set(name, 'file')
        tree.files.set(name, readFileSync(abs, 'utf8'))
      }
    })
  return tree
}

const treeFrom = (input) => {
  const tree = emptyTree()
  Object.keys(input).forEach((name) => {
    const value = input[name]
    if (typeof value === 'string') {
      tree.files.set(name, value)
      tree.rootEntries.set(name, 'file')
      return
    }
    tree.dirs.add(name)
    tree.rootEntries.set(name, 'dir')
    Object.keys(value).forEach((child) => {
      const childValue = value[child]
      if (typeof childValue === 'string') {
        tree.files.set(name + '/' + child, childValue)
        return
      }
      tree.dirs.add(name + '/' + child)
    })
  })
  return tree
}

const typeFiles = (tree, type) =>
  [...tree.files.keys()]
    .filter((relPath) => relPath.startsWith(type + '/'))
    .sort()

/* ---------- 校验主体 ---------- */

const majorOf = (version) => String(version).split('.')[0]

const validatePackage = (tree, spec, schemas) => {
  const issues = []
  const summary = { id: null, version: null, formatVersion: null, types: [], counts: {} }

  if (!tree.files.has(METADATA_FILE)) {
    issues.push(issue('metadata-missing', METADATA_FILE, '包根目录缺少元数据 ' + METADATA_FILE))
    return { issues, summary }
  }

  let metadata = null
  try {
    metadata = JSON.parse(stripBom(tree.files.get(METADATA_FILE)))
  } catch (error) {
    issues.push(issue('metadata-invalid-json', METADATA_FILE, '不是合法 JSON: ' + error.message))
    return { issues, summary }
  }

  validateSchema(schemas.package, metadata, METADATA_FILE, schemas.package, 'metadata-schema', issues, 0)
  if (issues.length > 0) {
    return { issues, summary }
  }

  summary.id = metadata.id
  summary.version = metadata.version
  summary.formatVersion = metadata.formatVersion
  summary.types = [...metadata.types]

  if (majorOf(metadata.formatVersion) !== majorOf(spec.format_version)) {
    issues.push(
      issue(
        'format-version-unsupported',
        METADATA_FILE + '/formatVersion',
        '格式版本 ' + metadata.formatVersion + ' 与当前支持的 ' + spec.format_version + ' 主版本不同',
      ),
    )
  }

  const declared = new Set(metadata.types)

  tree.rootEntries.forEach((kind, name) => {
    if (name === METADATA_FILE) {
      return
    }
    if (kind === 'file' && ALLOWED_ROOT_FILES.has(name)) {
      return
    }
    if (kind === 'dir' && CONTENT_TYPE_SET.has(name)) {
      return
    }
    issues.push(
      issue(
        'unexpected-entry',
        name,
        '包根目录不允许出现该' + (kind === 'dir' ? '目录' : '文件') + ';只允许 ' + METADATA_FILE + '、四类内容目录与可选的 README.md',
      ),
    )
  })

  CONTENT_TYPES.forEach((type) => {
    const hasDir = tree.dirs.has(type)
    const files = typeFiles(tree, type)
    if (!hasDir && files.length === 0) {
      if (declared.has(type)) {
        issues.push(issue('type-content-missing', type, '元数据声明了「' + TYPE_LABELS[type] + '」,但目录 ' + type + '/ 不存在'))
      }
      return
    }
    if (!declared.has(type)) {
      issues.push(
        issue('type-content-undeclared', type, '存在 ' + type + '/ 内容,但元数据的 types 未声明「' + TYPE_LABELS[type] + '」'),
      )
      return
    }
    if (files.length === 0) {
      issues.push(issue('content-empty', type, type + '/ 目录存在但没有内容文件;声明了该类型就必须给出至少一项内容'))
      return
    }
    ;[...tree.dirs].forEach((dir) => {
      if (dir.startsWith(type + '/')) {
        issues.push(issue('content-nested-dir', dir, '类型目录下不允许嵌套子目录'))
      }
    })
    files.forEach((relPath) => {
      if (!relPath.endsWith('.json')) {
        issues.push(issue('content-not-json', relPath, '内容文件必须是 .json'))
      }
    })
  })

  const labelIds = new Set()

  CONTENT_TYPES.forEach((type) => {
    if (!declared.has(type)) {
      return
    }
    const files = typeFiles(tree, type).filter((relPath) => relPath.endsWith('.json'))
    const ids = new Map()
    summary.counts[type] = files.length
    files.forEach((relPath) => {
      let doc = null
      try {
        doc = JSON.parse(stripBom(tree.files.get(relPath)))
      } catch (error) {
        issues.push(issue('content-invalid-json', relPath, '不是合法 JSON: ' + error.message))
        return
      }
      validateSchema(schemas[type], doc, relPath, schemas[type], 'content-schema', issues, 0)
      if (isObject(doc) && typeof doc.id === 'string') {
        if (ids.has(doc.id)) {
          issues.push(issue('content-duplicate-id', relPath, '内容标识 ' + doc.id + ' 与 ' + ids.get(doc.id) + ' 重复'))
        } else {
          ids.set(doc.id, relPath)
        }
        if (type === 'labels') {
          labelIds.add(doc.id)
        }
      }
      if (type !== 'strategies' || !isObject(doc) || !Array.isArray(doc.rules)) {
        return
      }
      doc.rules.forEach((rule, index) => {
        const at = relPath + '/rules/' + String(index)
        if (!isObject(rule)) {
          return
        }
        if (isObject(rule.strategy) && Object.keys(rule.strategy).length === 0) {
          issues.push(issue('rule-missing-strategy-field', at + '/strategy', '策略对象至少给出一个字段'))
        }
        if (declared.has('labels') && typeof rule.label === 'string' && !labelIds.has(rule.label)) {
          issues.push(
            issue('rule-label-unresolved', at + '/label', '引用的标签 ' + rule.label + ' 不在本包标签集内;包内声明了 labels 时引用必须自洽'),
          )
        }
      })
    })
  })

  return { issues, summary }
}

/* ---------- 输出 ---------- */

const formatTypes = (types) => (types.length === 0 ? '无' : types.map((type) => TYPE_LABELS[type] || type).join('、'))

const formatCounts = (counts) => {
  const parts = CONTENT_TYPES.filter((type) => counts[type] !== undefined).map((type) => TYPE_LABELS[type] + ' ' + String(counts[type]) + ' 项')
  return parts.length === 0 ? '无' : parts.join('、')
}

const printResult = (dir, result) => {
  const { issues, summary } = result
  console.log('包目录: ' + dir)
  if (summary.id !== null) {
    console.log('包标识: ' + summary.id + '@' + summary.version + ',格式版本 ' + summary.formatVersion)
    console.log('声明类型: ' + formatTypes(summary.types))
    console.log('内容数量: ' + formatCounts(summary.counts))
  }
  if (issues.length === 0) {
    console.log('结果: 通过')
    return
  }
  issues.forEach((item) => {
    console.log('  失败 [' + item.code + '] ' + item.path + ': ' + item.message)
  })
  console.log('结果: 未通过,' + String(issues.length) + ' 项问题')
}

/* ---------- 自检 ---------- */

const metaText = (overrides) => {
  const base = {
    formatVersion: '1.0.0',
    id: 'dsc-selftest',
    name: '自检包',
    version: '0.1.0',
    description: '自检用的内存包',
    author: 'omds-chat',
    types: ['persona'],
  }
  return JSON.stringify(Object.assign(base, overrides), null, 2)
}

const personaText = (overrides) =>
  JSON.stringify(Object.assign({ id: 'steady', name: '稳重', prefix: '先给结论。' }, overrides), null, 2)

const labelText = (overrides) => JSON.stringify(Object.assign({ id: 'daily-chat' }, overrides), null, 2)

const strategyText = (overrides) =>
  JSON.stringify(
    Object.assign(
      {
        id: 'daily-strategy',
        version: '1.0.0',
        rules: [{ label: 'daily-chat', strategy: { temperature: 0.7 } }],
      },
      overrides,
    ),
    null,
    2,
  )

const selfTestCases = [
  {
    name: '四类内容齐全的包通过',
    tree: {
      'asset.json': metaText({ types: ['persona', 'labels', 'strategies', 'injection'] }),
      persona: { 'a.json': personaText() },
      labels: { 'a.json': labelText() },
      strategies: { 'a.json': strategyText() },
      injection: { 'a.json': JSON.stringify({ id: 'brief', name: '简洁', text: '保持简洁。' }) },
    },
    expect: [],
  },
  {
    name: '只声明一类内容通过',
    tree: { 'asset.json': metaText(), persona: { 'a.json': personaText() } },
    expect: [],
  },
  {
    name: '策略包跨包引用标签通过',
    tree: { 'asset.json': metaText({ types: ['strategies'] }), strategies: { 'a.json': strategyText() } },
    expect: [],
  },
  {
    name: '缺少元数据被拒绝',
    tree: { persona: { 'a.json': personaText() } },
    expect: ['metadata-missing'],
  },
  {
    name: '元数据不是合法 JSON 被拒绝',
    tree: { 'asset.json': '{', persona: { 'a.json': personaText() } },
    expect: ['metadata-invalid-json'],
  },
  {
    name: '包标识格式错误被拒绝',
    tree: { 'asset.json': metaText({ id: 'Bad_ID' }), persona: { 'a.json': personaText() } },
    expect: ['metadata-schema'],
  },
  {
    name: '声明未知类型被拒绝',
    tree: { 'asset.json': metaText({ types: ['prompts'] }), prompts: { 'a.json': '{}' } },
    expect: ['metadata-schema'],
  },
  {
    name: '声明为空被拒绝',
    tree: { 'asset.json': metaText({ types: [] }), persona: { 'a.json': personaText() } },
    expect: ['metadata-schema'],
  },
  {
    name: '声明重复被拒绝',
    tree: { 'asset.json': metaText({ types: ['persona', 'persona'] }), persona: { 'a.json': personaText() } },
    expect: ['metadata-schema'],
  },
  {
    name: '声明了却没有内容被拒绝',
    tree: { 'asset.json': metaText({ types: ['persona', 'labels'] }), persona: { 'a.json': personaText() } },
    expect: ['type-content-missing'],
  },
  {
    name: '有内容却没有声明被拒绝',
    tree: { 'asset.json': metaText(), persona: { 'a.json': personaText() }, labels: { 'a.json': labelText() } },
    expect: ['type-content-undeclared'],
  },
  {
    name: '声明目录为空被拒绝',
    tree: { 'asset.json': metaText({ types: ['persona'] }), persona: {} },
    expect: ['content-empty'],
  },
  {
    name: '同类型内容标识重复被拒绝',
    tree: { 'asset.json': metaText(), persona: { 'a.json': personaText(), 'b.json': personaText() } },
    expect: ['content-duplicate-id'],
  },
  {
    name: '规则引用包内不存在的标签被拒绝',
    tree: {
      'asset.json': metaText({ types: ['labels', 'strategies'] }),
      labels: { 'a.json': labelText() },
      strategies: { 'a.json': strategyText({ rules: [{ label: 'missing', strategy: { temperature: 0.5 } }] }) },
    },
    expect: ['rule-label-unresolved'],
  },
  {
    name: '规则策略对象为空被拒绝',
    tree: {
      'asset.json': metaText({ types: ['labels', 'strategies'] }),
      labels: { 'a.json': labelText() },
      strategies: { 'a.json': strategyText({ rules: [{ label: 'daily-chat', strategy: {} }] }) },
    },
    expect: ['rule-missing-strategy-field'],
  },
  {
    name: '内容不是合法 JSON 被拒绝',
    tree: { 'asset.json': metaText(), persona: { 'a.json': '{' } },
    expect: ['content-invalid-json'],
  },
  {
    name: '类型目录放非 JSON 文件被拒绝',
    tree: { 'asset.json': metaText(), persona: { 'a.txt': 'hello' } },
    expect: ['content-not-json'],
  },
  {
    name: '包根目录出现多余条目被拒绝',
    tree: { 'asset.json': metaText(), persona: { 'a.json': personaText() }, notes: { 'a.md': 'hello' } },
    expect: ['unexpected-entry'],
  },
  {
    name: '格式版本主版本不一致被拒绝',
    tree: { 'asset.json': metaText({ formatVersion: '2.0.0' }), persona: { 'a.json': personaText() } },
    expect: ['format-version-unsupported'],
  },
  {
    name: '数值越界被拒绝',
    tree: {
      'asset.json': metaText({ types: ['labels', 'strategies'] }),
      labels: { 'a.json': labelText() },
      strategies: { 'a.json': strategyText({ rules: [{ label: 'daily-chat', strategy: { temperature: 3 } }] }) },
    },
    expect: ['content-schema'],
  },
]

const runSelfTest = (spec, schemas) => {
  const failures = []
  selfTestCases.forEach((testCase) => {
    const result = validatePackage(treeFrom(testCase.tree), spec, schemas)
    const codes = result.issues.map((item) => item.code)
    const ok =
      testCase.expect.length === 0
        ? result.issues.length === 0
        : testCase.expect.every((code) => codes.includes(code))
    if (!ok) {
      failures.push(
        '用例「' +
          testCase.name +
          '」判定不符:期望 ' +
          (testCase.expect.length === 0 ? '无问题' : testCase.expect.join('、')) +
          ',实际 ' +
          (codes.length === 0 ? '无问题' : codes.join('、')),
      )
    }
  })

  const sampleDirs = ['skeleton/dsc-example-asset']
  if (typeof spec.skeleton === 'string' && !sampleDirs.includes(spec.skeleton)) {
    sampleDirs.push(spec.skeleton)
  }
  if (existsSync(path.join(ROOT, 'examples'))) {
    readdirSync(path.join(ROOT, 'examples'))
      .sort()
      .forEach((name) => {
        const relPath = 'examples/' + name
        if (statSync(path.join(ROOT, relPath)).isDirectory() && existsSync(path.join(ROOT, relPath, METADATA_FILE))) {
          if (!sampleDirs.includes(relPath)) {
            sampleDirs.push(relPath)
          }
        }
      })
  }

  let sampleCount = 0
  sampleDirs.forEach((relPath) => {
    if (!existsSync(path.join(ROOT, relPath))) {
      failures.push('示例包目录不存在: ' + relPath)
      return
    }
    const result = validatePackage(readPackageTree(path.join(ROOT, relPath)), spec, schemas)
    sampleCount += 1
    if (result.issues.length > 0) {
      failures.push(
        '示例包 ' +
          relPath +
          ' 未通过: ' +
          result.issues.map((item) => '[' + item.code + '] ' + item.path + ': ' + item.message).join('; '),
      )
    }
  })

  if (failures.length > 0) {
    failures.forEach((message) => console.log('失败: ' + message))
    console.log('自检: 未通过,' + String(failures.length) + ' 项')
    return
  }
  console.log(
    '自检: 通过,' + String(selfTestCases.length) + ' 个用例与 ' + String(sampleCount) + ' 个示例包均符合预期',
  )
}

/* ---------- 命令行入口 ---------- */

const usage = () => {
  console.log('用法: node scripts/validate-asset-package.mjs <包目录> [更多包目录]')
  console.log('      node scripts/validate-asset-package.mjs --json <包目录>')
  console.log('      node scripts/validate-asset-package.mjs --self-test')
}

const main = () => {
  const argv = process.argv.slice(2)
  const wantsJson = argv.includes('--json')
  const wantsSelfTest = argv.includes('--self-test')
  const wantsHelp = argv.includes('--help') || argv.includes('-h')
  const targets = argv.filter((item) => !item.startsWith('-'))

  if (wantsHelp) {
    usage()
    return 0
  }

  let spec = null
  let schemas = null
  try {
    const loaded = loadSpec()
    spec = loaded.spec
    schemas = loaded.schemas
  } catch (error) {
    console.error('规范区读取失败: ' + error.message)
    return 2
  }

  if (wantsSelfTest) {
    try {
      runSelfTest(spec, schemas)
    } catch (error) {
      console.error('自检执行失败: ' + error.message)
      return 2
    }
    return 0
  }

  if (targets.length === 0) {
    usage()
    return 2
  }

  const unknownFlags = argv.filter((item) => item.startsWith('-') && item !== '--json')
  if (unknownFlags.length > 0) {
    console.error('未知参数: ' + unknownFlags.join('、'))
    usage()
    return 2
  }

  const results = []
  let readFailed = false
  targets.forEach((target) => {
    const dir = path.resolve(process.cwd(), target)
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      readFailed = true
      results.push({ dir: target, issues: [issue('package-not-directory', target, '不是可读取的目录')], summary: { id: null } })
      return
    }
    try {
      const result = validatePackage(readPackageTree(dir), spec, schemas)
      results.push(Object.assign({ dir: target }, result))
    } catch (error) {
      readFailed = true
      results.push({ dir: target, issues: [issue('package-read-failed', target, error.message)], summary: { id: null } })
    }
  })

  if (wantsJson) {
    const payload = {
      ok: results.every((item) => item.issues.length === 0),
      packages: results.map((item) => ({
        dir: item.dir,
        id: item.summary.id,
        version: item.summary.version,
        formatVersion: item.summary.formatVersion,
        types: item.summary.types || [],
        counts: item.summary.counts || {},
        issues: item.issues,
      })),
    }
    console.log(JSON.stringify(payload, null, 2))
    return payload.ok ? 0 : 1
  }

  results.forEach((item, index) => {
    if (index > 0) {
      console.log('')
    }
    printResult(item.dir, item)
  })
  const failed = results.filter((item) => item.issues.length > 0).length
  if (results.length > 1) {
    console.log('')
    console.log('汇总: ' + String(results.length - failed) + ' 个包通过,' + String(failed) + ' 个包未通过')
  }
  if (readFailed) {
    return 2
  }
  return failed > 0 ? 1 : 0
}

process.exitCode = main()
