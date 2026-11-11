#!/usr/bin/env node
import { loadConfig } from "./config.js";
import {
  checkQuota,
  draftFromTopic,
  exportJob,
  generateImagesForJob,
  refreshCatalog,
  reviewJob,
  runLocalPipeline,
} from "./jobs/pipeline.js";
import { listJobs, loadJob } from "./jobs/store.js";
import { loadCatalog } from "./openrouter/store.js";
import { buildModelRoute } from "./openrouter/router.js";
import { redactSecrets } from "./util/env.js";

function usage(): string {
  return `
wowacool（小红书图文工作台，一期本地 CLI）

用法：
  npm run cli -- catalog refresh     刷新免费文本模型目录
  npm run cli -- catalog list        查看本地缓存的免费模型与当前路由
  npm run cli -- quota               查询 OpenRouter 免费模型额度
  npm run cli -- draft --topic <选题> [--images 3] [--skip-llm]
  npm run cli -- images --job <id>
  npm run cli -- review approve --job <id> [--note 说明]
  npm run cli -- review reject --job <id> --note 说明
  npm run cli -- export --job <id>
  npm run cli -- show --job <id>
  npm run cli -- list
  npm run cli -- run --topic <选题> [--images 3] [--skip-llm] [--approve]

说明：
  - 文案默认走 OpenRouter 免费模型；--skip-llm 使用本地fixture，不消耗额度
  - 出图默认 mock 占位图，不走 Grok Bot 额度
  - 未人工批准（或 --approve）不得导出可发布素材包
`.trim();
}

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv.slice(2));
  const command = args._[0];
  if (!command || command === "help" || args.flags.help) {
    console.log(usage());
    return;
  }
  const config = loadConfig();

  switch (command) {
    case "catalog": {
      const sub = args._[1];
      if (sub === "refresh") {
        const result = await refreshCatalog(config);
        console.log(JSON.stringify({ ok: true, count: result.count, ids: result.ids }, null, 2));
        return;
      }
      if (sub === "list") {
        const catalog = loadCatalog(config.paths);
        if (!catalog) {
          console.log(JSON.stringify({ ok: false, error: "还没有本地目录，请先 catalog refresh" }, null, 2));
          return;
        }
        const route = catalog.models.length
          ? buildModelRoute(catalog.models, { preferredId: config.preferredModel })
          : null;
        console.log(
          JSON.stringify(
            {
              ok: true,
              refreshedAt: catalog.refreshedAt,
              count: catalog.models.length,
              ids: catalog.models.map((m) => m.id),
              route,
            },
            null,
            2,
          ),
        );
        return;
      }
      throw new Error("catalog 子命令只支持 refresh | list");
    }
    case "quota": {
      const snapshot = await checkQuota(config);
      console.log(JSON.stringify({ ok: true, quota: snapshot }, null, 2));
      return;
    }
    case "draft": {
      const topic = String(args.flags.topic ?? "");
      if (!topic) throw new Error("请使用 --topic 指定选题");
      const job = await draftFromTopic({
        topic,
        imageCount: num(args.flags.images),
        skipLlm: Boolean(args.flags["skip-llm"]),
        config,
      });
      console.log(JSON.stringify({ ok: true, job: publicJob(job) }, null, 2));
      return;
    }
    case "images": {
      const jobId = String(args.flags.job ?? "");
      if (!jobId) throw new Error("请使用 --job 指定任务 id");
      const job = await generateImagesForJob({ jobId, config });
      console.log(JSON.stringify({ ok: true, job: publicJob(job) }, null, 2));
      return;
    }
    case "review": {
      const decision = args._[1];
      if (decision !== "approve" && decision !== "reject") {
        throw new Error("review 子命令只支持 approve | reject");
      }
      const jobId = String(args.flags.job ?? "");
      if (!jobId) throw new Error("请使用 --job 指定任务 id");
      const note = args.flags.note ? String(args.flags.note) : undefined;
      if (decision === "reject" && !note) throw new Error("驳回时请使用 --note 说明原因");
      const job = reviewJob({
        jobId,
        decision: decision === "approve" ? "approved" : "rejected",
        note,
        config,
      });
      console.log(JSON.stringify({ ok: true, job: publicJob(job) }, null, 2));
      return;
    }
    case "export": {
      const jobId = String(args.flags.job ?? "");
      if (!jobId) throw new Error("请使用 --job 指定任务 id");
      const result = exportJob({ jobId, config });
      console.log(
        JSON.stringify(
          {
            ok: true,
            exportDir: result.exportDir,
            manifestPath: result.manifestPath,
            postNotePath: result.postNotePath,
            job: publicJob(result.job),
          },
          null,
          2,
        ),
      );
      return;
    }
    case "show": {
      const jobId = String(args.flags.job ?? "");
      if (!jobId) throw new Error("请使用 --job 指定任务 id");
      console.log(JSON.stringify({ ok: true, job: publicJob(loadJob(config.paths, jobId)) }, null, 2));
      return;
    }
    case "list": {
      const jobs = listJobs(config.paths).map(publicJob);
      console.log(JSON.stringify({ ok: true, jobs }, null, 2));
      return;
    }
    case "run": {
      const topic = String(args.flags.topic ?? "");
      if (!topic) throw new Error("请使用 --topic 指定选题");
      const result = await runLocalPipeline({
        topic,
        imageCount: num(args.flags.images),
        skipLlm: Boolean(args.flags["skip-llm"]),
        approve: Boolean(args.flags.approve),
        config,
      });
      console.log(
        JSON.stringify(
          {
            ok: true,
            job: publicJob(result.job),
            exportDir: result.exportResult?.exportDir,
            manifestPath: result.exportResult?.manifestPath,
          },
          null,
          2,
        ),
      );
      return;
    }
    default:
      throw new Error(`未知命令：${command}\n${usage()}`);
  }
}

function publicJob(job: ReturnType<typeof loadJob>) {
  return {
    id: job.id,
    topic: job.topic,
    status: job.status,
    title: job.title,
    content: job.content,
    tags: job.tags,
    imageCount: job.images.length,
    imagePrompts: job.imagePrompts,
    images: job.images.map((image) => ({
      filename: image.filename,
      relativePath: image.relativePath,
      url: image.url ?? null,
    })),
    modelUsed: job.modelUsed,
    review: job.review,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

function num(value: unknown): number | undefined {
  if (value === undefined || value === true || value === false) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseArgs(argv: string[]): { _: string[]; flags: Record<string, string | boolean> } {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      positional.push(token);
    }
  }
  return { _: positional, flags };
}

main(process.argv).catch((error: unknown) => {
  const message = redactSecrets(error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
