// ========== 共通：タブ切り替え ==========

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    document.querySelectorAll(".tab-button").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });

    document.querySelectorAll(".tab-content").forEach((sec) => {
      sec.classList.toggle("active", sec.id === target);
    });
  });
});

// ========== ファイル変換タブ（複数画像対応） ==========

const convertInputFile = document.getElementById("convert-input-file");
const inputTypeSelect = document.getElementById("input-type");
const outputTypeSelect = document.getElementById("output-type");
const outputFilenameInput = document.getElementById("output-filename");
const convertFileBtn = document.getElementById("convert-file-btn");
const convertStatus = document.getElementById("convert-status");
const convertPreviewCanvas = document.getElementById("convert-preview-canvas");
const convertPreviewFrame = document.getElementById("convert-preview-frame");
const convertDownloadArea = document.getElementById("convert-download-area");

let currentInputFiles = [];

convertInputFile.addEventListener("change", () => {
  const files = Array.from(convertInputFile.files || []);
  currentInputFiles = files;
  convertStatus.textContent = "";
  convertDownloadArea.innerHTML = "";
  hidePreview();

  if (files.length === 0) return;

  // 自動判定の場合：先頭ファイルを見て入力形式を推定
  const firstFile = files[0];
  if (inputTypeSelect.value === "auto") {
    const detected = detectInputType(firstFile);
    if (detected) {
      inputTypeSelect.value = detected;
      convertStatus.textContent = `入力形式を「${detected.toUpperCase()}」と判定しました。（先頭ファイル基準）`;
    }
  }
});

// 入力形式判定
function detectInputType(file) {
  const name = file.name.toLowerCase();
  const type = file.type;

  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpeg";
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (
    type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  )
    return "word";

  return null;
}

// プレビューを隠す
function hidePreview() {
  convertPreviewCanvas.style.display = "none";
  convertPreviewFrame.style.display = "none";
  const ctx = convertPreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, convertPreviewCanvas.width, convertPreviewCanvas.height);
  convertPreviewFrame.src = "about:blank";
}

// 変換実行
convertFileBtn.addEventListener("click", async () => {
  if (!currentInputFiles.length) {
    alert("先に入力ファイルを選択してください。");
    return;
  }

  const firstFile = currentInputFiles[0];
  const inputType = inputTypeSelect.value === "auto"
    ? detectInputType(firstFile) || "unknown"
    : inputTypeSelect.value;
  const outputType = outputTypeSelect.value;

  if (inputType === "unknown" || !["pdf", "jpeg", "png", "word"].includes(inputType)) {
    alert("入力形式を判定できません。手動で入力形式を選択してください。");
    return;
  }

  const baseName = (outputFilenameInput.value || "output_file").trim();
  const ext = getExtByFormat(outputType);

  convertStatus.textContent =
    `変換中... （入力: ${inputType.toUpperCase()} → 出力: ${outputType.toUpperCase()}、ファイル数: ${currentInputFiles.length}）`;
  convertDownloadArea.innerHTML = "";
  hidePreview();

  try {
    let index = 0;
    for (const file of currentInputFiles) {
      index += 1;
      const numberedName =
        currentInputFiles.length === 1
          ? `${baseName}.${ext}`
          : `${baseName}_${index}.${ext}`;

      await handleConversionMulti(inputType, outputType, file, numberedName, index === 1);
      // index === 1 のときだけプレビューに表示
    }

    convertStatus.textContent = `変換が完了しました。（${currentInputFiles.length} ファイル）`;
  } catch (err) {
    console.error(err);
    convertStatus.textContent = "変換中にエラーが発生しました。詳しくはコンソールを確認してください。";
    alert(err.message || "変換に失敗しました。");
  }
});

// 出力拡張子
function getExtByFormat(format) {
  switch (format) {
    case "pdf":
      return "pdf";
    case "jpeg":
      return "jpg";
    case "png":
      return "png";
    case "word":
      return "docx";
    default:
      return "bin";
  }
}

/**
 * 複数ファイル処理用の変換関数
 * @param {string} inputType  "jpeg" | "png" | "pdf" | "word"
 * @param {string} outputType 同上
 * @param {File} file         対象ファイル
 * @param {string} fileName   出力ファイル名（拡張子付き）
 * @param {boolean} doPreview true のときだけプレビューに反映
 */
async function handleConversionMulti(inputType, outputType, file, fileName, doPreview) {
  // 1) 同じ形式→そのままコピー
  if (inputType === outputType) {
    const blob = file.slice(0, file.size, file.type || "application/octet-stream");
    createDownloadLinkAppend(convertDownloadArea, blob, fileName);
    if (doPreview) {
      await previewFile(outputType, blob);
    }
    return;
  }

  // 2) 画像(JPEG/PNG) → 画像(JPEG/PNG)
  const isImageIn = inputType === "jpeg" || inputType === "png";
  const isImageOut = outputType === "jpeg" || outputType === "png";

  if (isImageIn && isImageOut) {
    const img = await loadImageFromFile(file);

    // プレビューは最初の1枚だけ
    if (doPreview) {
      const canvas = convertPreviewCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.style.display = "block";
    }

    // 出力用はオフスクリーンCanvas
    const offCanvas = document.createElement("canvas");
    offCanvas.width = img.width;
    offCanvas.height = img.height;
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(img, 0, 0);

    const mimeType = outputType === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await canvasToBlob(offCanvas, mimeType, 0.92);

    createDownloadLinkAppend(convertDownloadArea, blob, fileName);
    return;
  }

  // 3) 画像(JPEG/PNG) → PDF（簡易ダミー：実際はPNG出力）
  if (isImageIn && outputType === "pdf") {
    const pdfBlob = await imageToPdfBlobSimple(file, doPreview);
    createDownloadLinkAppend(convertDownloadArea, pdfBlob, fileName);
    if (doPreview) {
      await previewFile("pdf", pdfBlob);
    }
    return;
  }

  // 4) その他は未対応
  throw new Error(
    `この組み合わせ（入力: ${inputType.toUpperCase()} → 出力: ${outputType.toUpperCase()}）は、現在のブラウザ版では未対応です。\n` +
    "PDF ↔ Word や本格的なPDF生成は、ローカルサーバやjsPDF・LibreOfficeなどと連携して実装してください。"
  );
}

// 画像ファイルを Image として読み込む
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// canvas → Blob
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Blobの生成に失敗しました。"));
        return;
      }
      resolve(blob);
    }, mimeType, quality);
  });
}

/**
 * 画像1枚 → PDF(ダミー) Blob
 * 本格的にやる場合は jsPDF などに差し替える前提の簡易版。
 * 今は PNG Blob を返しており、拡張子が .pdf でも中身は画像です。
 */
async function imageToPdfBlobSimple(file, doPreview) {
  const img = await loadImageFromFile(file);
  const canvas = convertPreviewCanvas;
  const ctx = canvas.getContext("2d");

  if (doPreview) {
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    canvas.style.display = "block";
  } else {
    const offCanvas = document.createElement("canvas");
    offCanvas.width = img.width;
    offCanvas.height = img.height;
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(img, 0, 0);
    return canvasToBlob(offCanvas, "image/png", 0.92);
  }

  // プレビュー用のc
