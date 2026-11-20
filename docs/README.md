# 文档索引

本索引登记本仓库的每一份文档、它的职责与适用场景,并说明数据、校验与说明三层之间的关系。本仓库只产出一个资产包,文档都围绕这一份包:写它、校验它、解释它为什么这样写。

## 主表

| 文档 | 职责一句话 | 主要内容 | 什么时候需要读 | 主要读者 |
|:---:|:---:|:---:|:---:|:---:|
| [README.md](../README.md) | 面向使用者的总览 | 资产包是什么、四类内容分工、如何被收录、不包含什么、校验命令、仓库组成、规范与版本 | 第一次接触本仓库;要导入或收录这份包时 | 资产使用者、合集维护者 |
| [assets/dsc-humanize-assistant/README.md](../assets/dsc-humanize-assistant/README.md) | 包内说明 | 包标识与版本、内容清单、使用约定 | 想快速知道包里有哪些内容项时 | 资产使用者、评审者 |
| [docs/design/tone-package.md](design/tone-package.md) | 设计取舍说明 | 人设为什么这样写、四类如何分工、标签如何划分、阈值与优先级怎么定、未定稿项 | 想改这份包之前;质疑某条数值或某句文本时 | 资产作者、评审者 |
| [specs/spec-version.json](../specs/spec-version.json) | 版本与 Schema 路径的登记处 | `spec_version`、`format_version`、五份 Schema 的仓库内路径、示例包路径 | 引用格式版本时;脚本定位 Schema 时 | 资产作者、工具作者 |
| [schemas/asset-package.schema.json](../schemas/asset-package.schema.json) | 元数据 `asset.json` 的机器可校验定义 | 必填字段、包标识与版本格式、类型声明取值、字段封闭 | 改元数据时 | 资产作者 |
| [schemas/content/persona.schema.json](../schemas/content/persona.schema.json) | 人物设定的结构定义 | 标识、展示名、固定前缀、语义说明 | 写人设时 | 资产作者 |
| [schemas/content/labels.schema.json](../schemas/content/labels.schema.json) | 分类标签集的结构定义 | 标签标识、语义说明、关键词、权重 | 写标签时 | 资产作者 |
| [schemas/content/strategies.schema.json](../schemas/content/strategies.schema.json) | 策略规则的结构定义 | 策略表标识与版本、兜底策略、规则项、策略对象与取值边界 | 写策略时 | 资产作者 |
| [schemas/content/injection.schema.json](../schemas/content/injection.schema.json) | 注入文本的结构定义 | 片段标识、展示名、注入文本、语义说明 | 写注入片段时 | 资产作者 |
| [scripts/validate-asset-package.mjs](../scripts/validate-asset-package.mjs) | 零依赖校验脚本 | 元数据与内容 Schema 校验、声明与内容双向一致、根目录条目、标识唯一、标签引用 | 发布或收录前校验时 | 资产作者、合集维护者 |

## 冲突时以谁为准

| 层级 | 来源 | 含义 |
|:---:|:---:|:---:|
| 1 | 资产包模板仓库的格式规范 | 语义与判定口径的权威文本;本仓库不复写,也不在此改规则 |
| 2 | [Schema 副本](../schemas/asset-package.schema.json) | 与模板同版的结构表达;发现与规范不一致时,先回模板仓库修 |
| 3 | [校验脚本](../scripts/validate-asset-package.mjs)与包内容 | 可执行的判定;脚本与 Schema 冲突说明副本未同步 |
| 4 | [README](../README.md)与本索引 | 说明与操作指引,不承载规则 |

本仓库的 Schema 与校验脚本是从模板仓库原样复制的副本,只用于离线校验:在这里改它们等于分叉一份契约,所以改动一律回模板仓库做,再重新同步副本。

## 分层

| 层 | 位置 | 作用 |
|:---:|:---:|:---:|
| 数据层 | `assets/dsc-humanize-assistant/` | 资产包本体:元数据与四类内容,只读、可整包分发 |
| 校验层 | `schemas/`、`scripts/`、`specs/` | 让数据可以被机器判定:Schema、校验脚本与版本登记 |
| 说明层 | `README.md`、`docs/`、包内 `README.md` | 面向人的入口、设计与导航,不新增规则 |

三层的关系是单向的:说明层解释数据层,校验层判定数据层,数据层不依赖前两者。删掉文档不影响包能被校验;改文档也不改变包的判定结果。

## 目录结构

```text
dsc-humanize-assistant/
├── docs/
│   ├── index.md                       文档索引(本文)
│   └── design/
│       └── tone-package.md            资产包设计说明与未定稿项
├── assets/
│   └── dsc-humanize-assistant/        资产包本体
│       ├── asset.json                 元数据与类型声明
│       ├── README.md                  包内说明
│       ├── injection/                 注入文本
│       ├── labels/                    分类标签集
│       ├── persona/                   人物设定
│       └── strategies/                策略规则
├── schemas/
│   ├── asset-package.schema.json      元数据 Schema
│   └── content/                       四类内容 Schema
├── scripts/
│   └── validate-asset-package.mjs     零依赖校验脚本
└── specs/
    └── spec-version.json              版本与 Schema 路径登记
```

## 维护约定

- 改包内容时同步三处:内容文件、包内 README 的内容清单、目录索引里的内容项名称;只改一处会让三处互相矛盾。
- 改人设、标签或阈值时,先在[设计说明](design/tone-package.md)里改掉理由,再改数据;理由与数据不一致时,下一个维护者只能靠猜。
- 改格式相关的副本(Schema、校验脚本、`spec-version.json`)一律回模板仓库做,再整文件同步,不在这里手工调整。
- 包内容变化时递增 `asset.json` 的 `version`,不改写已发布版本。
- 本文只登记文档的职责与适用场景,不摘录正文;新增或删除文档时同步主表与目录结构。
