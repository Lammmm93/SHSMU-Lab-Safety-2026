/**
 * 交医实验室安全题库导出脚本（浏览器 Console / DevTools Snippets）
 *
 * 使用范围：仅导出当前账号已获授权查看的题库预览内容。
 * 不含账号密码，不尝试绕过登录、验证码、学习时长或考试限制；
 * 不适用于正式考试的自动答题。
 *
 * 操作步骤：
 * 1. 正常登录 https://aq.shsmu.edu.cn 并进入可以预览题库的页面。
 * 2. 打开浏览器开发者工具（Edge/Chrome），切换到 Network。
 * 3. 点击网页的「查询」按钮，确保出现 questionList.html 请求。
 * 4. 在 Sources -> Snippets 新建片段，粘贴本文件内容并运行。
 * 5. 等待脚本结束，浏览器会下载 JSON；运行过程中请保持标签页打开。
 *
 * 1251 题、间隔 1200ms 时通常需要约 25-30 分钟。
 * 请遵守学校平台使用规则，避免重复或高频调用接口。
 */

(async function exportLabSafetyQuestions() {
  "use strict";

  const START = 0;      // 从第几题开始（0 为首题），断点续传时可调整
  const LIMIT = 1251;   // 计划导出题数；可先改成 10 测试
  const DELAY = 1200;   // 两次题目详情请求之间等待毫秒数

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const listRequest = performance
    .getEntriesByType("resource")
    .map(entry => entry.name)
    .reverse()
    .find(name => name.includes("questionList.html?"));

  if (!listRequest) {
    console.error("未找到 questionList.html 请求。请先在题库预览页点击「查询」，然后重新运行。");
    return;
  }

  // 仅使用本网页正常登录会话中的同源读取请求。
  const listBase = new URL(listRequest);
  if (listBase.origin !== location.origin) {
    console.error("检测到非同源题库请求，已停止。");
    return;
  }

  async function getData(url) {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const payload = await response.json();
    if (Number(payload.code) !== 200) {
      throw new Error(payload.message || "题库接口返回错误");
    }
    return payload.data;
  }

  // 只保留学习所需字段，避免保存出题人姓名、内部用户编号等元数据。
  function simplify(detail) {
    return {
      question_no: detail.question_no,
      question_stem: detail.question_stem,
      question_type: detail.question_type,
      knowledge_point: detail.knowledge_point,
      question_result: (detail.question_result || [])
        .map(option => ({
          numrow: option.numrow,
          choice: option.choice,
          right_wrong_mark: option.right_wrong_mark
        }))
        .sort((a, b) => Number(a.numrow) - Number(b.numrow)),
      answer: detail.answer,
      analysis: detail.analysis || ""
    };
  }

  const questions = [];
  const ids = new Set();
  let total = 0;

  try {
    for (let start = START; start < START + LIMIT; start += 10) {
      const listUrl = new URL(listBase);
      listUrl.searchParams.set("start", String(start));
      listUrl.searchParams.set("length", "10");
      listUrl.searchParams.set("draw", String(Math.floor(start / 10) + 1));

      const page = await getData(listUrl);
      total = Number(page.total) || total;
      const remaining = Math.min(
        10,
        START + LIMIT - start,
        total - start
      );

      if (remaining <= 0) break;

      const items = (page.list || []).slice(0, remaining);
      if (items.length === 0) break;

      for (const item of items) {
        if (!item.question_no || ids.has(String(item.question_no))) continue;

        const detailUrl = new URL(
          "/shsmu/Center/Question/getQuestionDetail.html",
          location.origin
        );
        detailUrl.searchParams.set("question_no", String(item.question_no));
        const detail = await getData(detailUrl);

        questions.push(simplify(detail));
        ids.add(String(item.question_no));
        console.log(
          "已读取 " + questions.length + " 题，题号：" + detail.question_no
        );
        await sleep(DELAY);
      }
    }
  } catch (error) {
    console.error("读取被中断，将尝试保存已获取的题目：", error);
  }

  if (questions.length === 0) {
    console.error("未读取到题目，没有生成导出文件。");
    return;
  }

  const json = JSON.stringify(questions, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download =
    "实验室安全题库_" + (START + 1) + "-" +
    (START + questions.length) + ".json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);

  console.log("========== 题库导出完成 ==========");
  console.log("网页显示题库总数：" + total);
  console.log("本次成功导出：" + questions.length);
  console.log("文件内容：题干、题型、知识点、选项及答案（精简版）");
})();
