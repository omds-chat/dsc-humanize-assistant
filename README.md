# dsc-humanize-assistant

本仓库是一个人性化资产包的开发仓库,只放一个资产包:[assets/dsc-humanize-assistant/](assets/dsc-humanize-assistant/README.md)。包的主题是模仿 DeepSeek 网页版那种克制的表达:直接回答、能短不长、少客套。

资产包是 dsc-humanize 内核读取的纯数据,由元数据与四类内容(人物设定、分类标签集、策略规则、注入文本)组成。本仓库不包含可执行代码:没有构建、没有依赖、没有运行时;仓库里唯一的脚本是从资产包模板原样取来的零依赖校验脚本,它只读 JSON、不联网、不生成也不签发任何证书。

## 这个资产包是什么

| 项 | 内容 |
|:---:|:---:|
| 包标识 | `dsc-humanize-assistant` |
| 包版本 | `0.1.1` |
| 格式版本 | `1.0.0` |
| 声明类型 | 人物设定、分类标签集、策略规则、注入文本 |
| 一句话 | 把「克制、简洁、少客套」拆成可执行的四类内容,而不是写一句风格形容词 |

包内容按四类分工:

| 类型 | 内容项 | 解决什么 |
|:---:|:---:|:---:|
| 人物设定 | `restrained` | 每次都生效的底线:先答、不重复问题、不铺垫、不编造;约束覆盖中英文回复 |
| 分类标签集 | `quick-fact`、`how-to`、`deep-dive`、`casual-chat`、`rewrite`、`code-help` | 按「答案该长什么样」把请求分成六类 |
| 策略规则 | `restrained-tone` | 兜底采样参数,加六条按标签收敛的参数与情境注入 |
| 注入文本 | `answer-first`、`no-closing`、`plain-wording`、`flat-structure`、`ask-one`、`contrast-examples` | 可单独勾选的结构规则与对照示例,可与人设叠加,也可单独使用 |

为什么这样写人设、标签怎么划分、阈值怎么定,见[资产包设计说明](docs/design/tone-package.md)。

## 如何被收录

本仓库不是合集,只负责产出被收录的那一份包;收录方是 `dsc-humanize-inner-asset`。

| 项 | 约定 |
|:---:|:---:|
| 收录单位 | 以 [assets/dsc-humanize-assistant/](assets/dsc-humanize-assistant/README.md) 整目录为单位,不拆成单类内容 |
| 索引依据 | `asset.json` 的 `id`、`name`、`version`、`description`、`author`、`license`、`types` |
| 内容不变 | 收录前后包内文件逐字节一致;本仓库与收录方都不改写包内容 |
| 包目录 | 包不在仓库根目录:根目录还有 README、文档、Schema 与校验脚本,而包根目录只允许元数据、已声明的类型目录与可选的 README |
| 唯一性 | `dsc-humanize-assistant` 在合集内唯一;内容变化时递增 `version`,不改写已发布版本 |
| 校验前置 | 收录前跑本 README 的校验命令,任何一项不通过就整包拒绝 |
| 签名 | 资产包不做代码签名,包内不放签名材料;本仓库不生成、不签发、不替换任何证书与私钥 |

被收录后它仍是普通资产包:用户导入后可以改、可以再导出,没有锁定项,也不因为来自合集而带特权字段。

## 不包含什么

| 不包含 | 原因 |
|:---:|:---:|
| 可执行代码 | 资产包是数据,由内核读取;包里出现脚本,内容问题就变成代码审计问题 |
| 构建与依赖 | 校验脚本只用 Node 内置模块;仓库没有 `node_modules`、没有打包步骤 |
| 证书与私钥 | 资产包不做代码签名;本仓库不生成、不签发、不替换任何证书 |
| 默认值 | 包内不设「默认人设」「默认标签集」;用哪一份由用户在来源选择里决定 |
| 用户当前使用状态 | 用户实际在用的组合结果不在包内;包只读,导入与装配都不回写 |
| 占位内容 | 每条人设文本、每个关键词、每个参数都是可用值,没有待填项 |

## 校验

在本仓库根目录运行,只用 Node,不联网、不安装依赖:

```bash
node scripts/validate-asset-package.mjs assets/dsc-humanize-assistant          # 人类可读输出
node scripts/validate-asset-package.mjs --json assets/dsc-humanize-assistant   # JSON 输出
npm run validate                                                               # 同上第一条
```

| 退出码 | 含义 |
|:---:|:---:|
| 0 | 通过 |
| 1 | 存在不合规的项,逐条列出问题码与位置 |
| 2 | 用法错误或读取失败 |

校验覆盖:元数据符合 Schema、包根目录只允许固定条目、声明与内容双向一致、内容文件符合该类型 Schema、同类型内容标识唯一、策略规则的标签引用自洽。

`--self-test` 属于资产包模板仓库的回归用例,断言的是模板自带的骨架与示例包;本仓库不带这两份示例,因此不提供自检入口,只用上面的命令校验本仓库的包。

## 仓库组成

```text
dsc-humanize-assistant/
├── .gitattributes                    统一 LF 换行
├── .gitignore                        忽略规则
├── COPYRIGHT                         版权说明
├── LICENSE                           许可证
├── README.md                         本文件
├── package.json                      工程信息与校验命令
├── assets/
│   └── dsc-humanize-assistant/       资产包本体
│       ├── asset.json                 元数据与类型声明
│       ├── README.md                  面向人的包说明,不属于内容
│       ├── persona/                   人物设定
│       ├── labels/                    分类标签集
│       ├── strategies/                策略规则
│       └── injection/                 注入文本
├── docs/
│   ├── index.md                       文档索引
│   └── design/
│       └── tone-package.md            资产包设计说明与未定稿项
├── schemas/
│   ├── asset-package.schema.json      元数据 Schema
│   └── content/                       四类内容的 Schema
├── scripts/
│   └── validate-asset-package.mjs     零依赖校验脚本
└── specs/
    └── spec-version.json              规范与格式版本、Schema 路径
```

## 规范与版本

| 项 | 当前值 | 位置 |
|:---:|:---:|:---:|
| 格式版本 | 1.0.0 | [specs/spec-version.json](specs/spec-version.json) |
| 规范版本 | 1.0.0 | 同上 |
| Schema 副本 | 与模板同版 | [schemas/](schemas/asset-package.schema.json) |
| 校验脚本副本 | 与模板同版 | [scripts/validate-asset-package.mjs](scripts/validate-asset-package.mjs) |

- 资产包格式的权威文本与 Schema 由资产包模板仓库 `dsc-humanize-asset-template` 维护;本仓库保留 Schema 与版本登记的副本,只用于离线校验,不在这里改规则。
- 两侧口径不一致时以模板仓库的规范为准,回到模板仓库修改并升版本;本仓库不就地打补丁。
- [specs/spec-version.json](specs/spec-version.json) 的 `skeleton` 字段在本仓库指向 `assets/dsc-humanize-assistant`,让校验脚本把本仓库的包当作示例包;模板仓库里它指向模板自带的骨架。

## 适用范围

「模仿 DeepSeek 网页版的人性化」指表达风格上的取舍,不是与官方一致的承诺:本包的目标是逼近官方风格里可对外声明的那一层(先答、能短不长、少客套这类可观察行为),不追求身份对齐——包内不声明任何身份——也不承诺参数一致:包内数值是本包自己的取舍,不代表官方取值,也不声称与官方一致。

## 许可

Apache-2.0,见 [LICENSE](LICENSE) 与 [COPYRIGHT](COPYRIGHT)。
