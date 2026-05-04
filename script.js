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

// ========== ファイル変換タブ ==========

const convertInputFile = document.getElementById("convert-input-file");
const inputTypeSelect = document.getElementById("input-type");
const outputTypeSelect = document.getElementById("output-type");
const outputFilenameInput = document.getElementById("output-filename");
const convertFileBtn = document.getElementById("convert-file-btn");
const convertStatus = document.getElementById("convert-status");
const convertPreviewCanvas = document.getElementById("convert-preview-canvas");
const convertPreviewFrame = document.getElementById("convert-preview-frame");
const convertDownloadArea = document.getElementById("convert-download-area");

let currentInputFile = null;

// 入力ファイル選択
convertInputFile.addEventListener("change", () => {
  const file = convertInputFile.files[0];
  currentInputFile = file || null;
  convertStatus.textContent = "";
  convertDownloadArea.innerHTML = "";
  hidePreview();

  if (!file) return;

  // 自動判定の場合、MIMEタイプ or 拡張子から推定してセレクトを更新
  if (inputTypeSelect.value === "auto") {
    const detected = detectInputType(file);
    if (detected) {
      inputTypeSelect.value = detected;
      convertStatus.textContent = `入力形式を「${detected.toUpperCase()}」と判定しました。`;
    }
  }
});

// 入力タイプ判定
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

// プレビューを一旦隠す
function hidePreview() {
  convertPreviewCanvas.style.display = "none";
  convertPreviewFrame.style.display = "none";
  const ctx = convertPreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, convertPreviewCanvas.width, convertPreviewCanvas.height);
  convertPreviewFrame.src = "about:blank";
}

// 変換ボタンクリック
convertFileBtn.addEventListener("click", () => {
  if (!currentInputFile) {
    alert("先に入力ファイルを選択してください。");
    return;
  }

  const inputType = inputTypeSelect.value === "auto"
    ? detectInputType(currentInputFile) || "unknown"
    : inputTypeSelect.value;

  const outputType = outputTypeSelect.value;

  if (inputType === "unknown" || !["pdf", "jpeg", "png", "word"].includes(inputType)) {
    alert("入力形式を判定できません。手動で入力形式を選択してください。");
    return;
  }

  const baseName = (outputFilenameInput.value || "output_file").trim();
  const ext = getExtByFormat(outputType);
  const fileName = `${baseName}.${ext}`;

  convertStatus.textContent = `変換中... （入力: ${inputType.toUpperCase()} → 出力: ${outputType.toUpperCase()}）`;
  convertDownloadArea.innerHTML = "";
  hidePreview();

  // ここで「入力形式 × 出力形式」に応じて処理を分岐
  handleConversion(inputType, outputType, currentInputFile, fileName)
    .then(() => {
      convertStatus.textContent = `変換が完了しました。（${fileName}）`;
    })
    .catch((err) => {
      console.error(err);
      convertStatus.textContent = "変換中にエラーが発生しました。詳しくはコンソールを確認してください。";
      alert(err.message || "変換に失敗しました。");
    });
});

// 出力拡張子決定
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

// 実際の変換処理
async function handleConversion(inputType, outputType, file, fileName) {
  // 1) 同じ形式への変換（基本はそのままコピーとみなす）
  if (inputType === outputType) {
    const blob = file.slice(0, file.size, file.type || "application/octet-stream");
    createDownloadLink(convertDownloadArea, blob, fileName);
    // PDFや画像ならプレビュー
    await previewFile(outputType, blob);
    return;
  }

  // 2) 画像(JPEG/PNG) → 画像(JPEG/PNG)
  const isImageIn = inputType === "jpeg" || inputType === "png";
  const isImageOut = outputType === "jpeg" || outputType === "png";

  if (isImageIn && isImageOut) {
    const img = await loadImageFromFile(file);
    const canvas = convertPreviewCanvas;
    const ctx = canvas.getContext("2d");
    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    canvas.style.display = "block";

    const mimeType = outputType === "jpeg" ? "image/jpeg" : "image/png";
    const blob = await canvasToBlob(canvas, mimeType, 0.92);
    createDownloadLink(convertDownloadArea, blob, fileName);
    return;
  }

  // 3) 画像(JPEG/PNG) → PDF
  if (isImageIn && outputType === "pdf") {
    const pdfBlob = await imageToPdfBlob(file);
    createDownloadLink(convertDownloadArea, pdfBlob, fileName);
    await previewFile("pdf", pdfBlob);
    return;
  }

  // 4) それ以外は今は未実装（ブラウザだけでは重い/複雑）
  throw new Error(
    `この組み合わせ（入力: ${inputType.toUpperCase()} → 出力: ${outputType.toUpperCase()}）は、現在のブラウザ版では未対応です。\n` +
    "ローカルサーバや外部ツール(ffmpeg, libreoffice など)と連携して実装してください。"
  );
}

// 画像ファイルを Image オブジェクトとして読み込む
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

// 画像(1枚) → PDF Blob（簡易版）
async function imageToPdfBlob(file) {
  // jsPDF を使う方法もあるが、CDN追加が必要になるので
  // ここでは簡易的に「画像を埋め込んだPDF」を生成する最小構成は省略し、
  // 実装しやすいようにコメントでガイドだけ残す形もあり。
  //
  // ここでは、実装例として jsPDF を後から組み込める前提で「未実装」とせず、
  // シンプルなPDFっぽいバイナリを作るのは現実的ではないので、
  // 実際には jsPDF などを読み込んで実装してください。
  //
  // ひとまずダミー実装：画像をそのまま返す（プレビュー用にのみ利用）
  const img = await loadImageFromFile(file);
  const canvas = convertPreviewCanvas;
  const ctx = canvas.getContext("2d");
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  canvas.style.display = "block";

  // 本当のPDFではないが、ここでは一時的にPNGとして返すダミー実装
  // 実運用では jsPDF を利用して PDF を生成するコードに差し替えてください。
  const blob = await canvasToBlob(canvas, "image/png", 0.92);
  alert("現状のサンプルでは画像→PDF はダミー実装です。\n本格的なPDF生成には jsPDF などのライブラリを組み込んでください。");
  return blob;
}

// 形式に応じて簡易プレビュー
async function previewFile(format, blob) {
  if (format === "jpeg" || format === "png") {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = convertPreviewCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.style.display = "block";
      URL.revokeObjectURL(url);
    };
    img.src = url;
  } else if (format === "pdf") {
    const url = URL.createObjectURL(blob);
    convertPreviewFrame.src = url;
    convertPreviewFrame.style.display = "block";
  } else {
    // Wordなどはブラウザ内でのプレビューが難しいので省略
    convertPreviewCanvas.style.display = "none";
    convertPreviewFrame.style.display = "none";
  }
}

// ダウンロードリンク生成
function createDownloadLink(container, blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.textContent = `「${fileName}」としてダウンロード`;
  link.className = "download-link";

  container.innerHTML = "";
  container.appendChild(link);
}

// ========== QRコード作成 ==========

const qrTextArea = document.getElementById("qr-text");
const qrFilenameInput = document.getElementById("qr-filename");
const generateQrBtn = document.getElementById("generate-qr-btn");
const copyQrBtn = document.getElementById("copy-qr-btn");
const qrCanvas = document.getElementById("qr-canvas");
const qrDownloadArea = document.getElementById("qr-download-area");

generateQrBtn.addEventListener("click", () => {
  const text = qrTextArea.value.trim();
  if (!text) {
    alert("QRコードにしたいテキストを入力してください。");
    return;
  }

  const baseName = qrFilenameInput.value.trim() || "qrcode";
  const fileName = `${baseName}.png`;

  QRCode.toCanvas(
    qrCanvas,
    text,
    { width: 256, margin: 2 },
    (err) => {
      if (err) {
        console.error(err);
        alert("QRコードの生成に失敗しました。");
        return;
      }
      qrCanvas.toBlob((blob) => {
        if (!blob) {
          alert("QRコード画像の生成に失敗しました。");
          return;
        }
        qrDownloadArea.innerHTML = "";
        createDownloadLink(qrDownloadArea, blob, fileName);
        copyQrBtn.disabled = false;
      });
    }
  );
});

copyQrBtn.addEventListener("click", async () => {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert("このブラウザは画像のクリップボードコピーに対応していません。");
    return;
  }

  qrCanvas.toBlob(async (blob) => {
    try {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert("QRコード画像をクリップボードにコピーしました。");
    } catch (e) {
      console.error(e);
      alert("クリップボードへのコピーに失敗しました。");
    }
  });
});

// ========== バーコード作成 ==========

const barcodeTextInput = document.getElementById("barcode-text");
const barcodeFormatSelect = document.getElementById("barcode-format");
const barcodeFilenameInput = document.getElementById("barcode-filename");
const generateBarcodeBtn = document.getElementById("generate-barcode-btn");
const copyBarcodeBtn = document.getElementById("copy-barcode-btn");
const barcodeSvg = document.getElementById("barcode-svg");
const barcodeDownloadArea = document.getElementById("barcode-download-area");

generateBarcodeBtn.addEventListener("click", () => {
  const text = barcodeTextInput.value.trim();
  if (!text) {
    alert("バーコードにしたいテキストを入力してください。");
    return;
  }

  const format = barcodeFormatSelect.value;

  try {
    JsBarcode(barcodeSvg, text, {
      format: format,
      lineColor: "#000",
      width: 2,
      height: 80,
      displayValue: true,
    });

    const baseName = barcodeFilenameInput.value.trim() || "barcode";
    const fileName = `${baseName}.png`;

    svgToPngBlob(barcodeSvg)
      .then((blob) => {
        barcodeDownloadArea.innerHTML = "";
        createDownloadLink(barcodeDownloadArea, blob, fileName);
        copyBarcodeBtn.disabled = false;
      })
      .catch((err) => {
        console.error(err);
        alert("バーコード画像の生成に失敗しました。");
      });
  } catch (e) {
    console.error(e);
    alert("バーコードの生成に失敗しました。入力値や形式を確認してください。");
  }
});

copyBarcodeBtn.addEventListener("click", () => {
  if (!navigator.clipboard || !window.ClipboardItem) {
    alert("このブラウザは画像のクリップボードコピーに対応していません。");
    return;
  }

  svgToPngBlob(barcodeSvg)
    .then(async (blob) => {
      try {
        const item = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([item]);
        alert("バーコード画像をクリップボードにコピーしました。");
      } catch (e) {
        console.error(e);
        alert("クリップボードへのコピーに失敗しました。");
      }
    })
    .catch((err) => {
      console.error(err);
      alert("バーコード画像の生成に失敗しました。");
    });
});

// SVG → PNG Blob
function svgToPngBlob(svgElement) {
  return new Promise((resolve, reject) => {
    const xml = new XMLSerializer().serializeToString(svgElement);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = "data:image/svg+xml;base64," + svg64;

    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const bbox = svgElement.getBBox();
        const width = Math.ceil(bbox.width + bbox.x * 2);
        const height = Math.ceil(bbox.height + bbox.y * 2);

        canvas.width = width || 300;
        canvas.height = height || 150;

        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("Blob生成に失敗しました。"));
            return;
          }
          resolve(blob);
        }, "image/png");
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = image64;
  });
}
