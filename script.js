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

// ========== ファイル変換タブ（複数画像対応＋PDFまとめ） ==========

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

  const firstFile = files[0];
  if (inputTypeSelect.value === "auto") {
    const detected = detectInputType(firstFile);
    if (detected) {
      inputTypeSelect.value = detected;
      convertStatus.textContent =
        `入力形式を「${detected.toUpperCase()}」と判定しました。（先頭ファイル基準）`;
    }
  }
});

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

function hidePreview() {
  convertPreviewCanvas.style.display = "none";
  convertPreviewFrame.style.display = "none";
  const ctx = convertPreviewCanvas.getContext("2d");
  ctx.clearRect(0, 0, convertPreviewCanvas.width, convertPreviewCanvas.height);
  convertPreviewFrame.src = "about:blank";
}

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
    // 画像(JPEG/PNG) → PDF の場合は「1つのPDF」にまとめる
    const isImageIn = inputType === "jpeg" || inputType === "png";
    if (isImageIn && outputType === "pdf") {
      const fileName = `${baseName}.${ext}`;
      const pdfBlob = await imagesToSinglePdfBlob(currentInputFiles, true); // プレビューON
      createSingleDownloadLink(convertDownloadArea, pdfBlob, fileName);
      await previewFile("pdf", pdfBlob);
      convertStatus.textContent = `変換が完了しました。（${fileName} にまとめました）`;
      return;
    }

    // それ以外の組み合わせは、従来通りファイルごとに出力
    let index = 0;
    for (const file of currentInputFiles) {
      index += 1;
      const numberedName =
        currentInputFiles.length === 1
          ? `${baseName}.${ext}`
          : `${baseName}_${index}.${ext}`;

      await handleConversionMulti(inputType, outputType, file, numberedName, index === 1);
    }

    convertStatus.textContent =
      `変換が完了しました。（${currentInputFiles.length} ファイル）`;
  } catch (err) {
    console.error(err);
    convertStatus.textContent =
      "変換中にエラーが発生しました。詳しくはコンソールを確認してください。";
    alert(err.message || "変換に失敗しました。");
  }
});

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
 * 「画像(JPEG/PNG) 複数 → 1つのPDF」にまとめる
 * A4縦（mm単位）、画像はページ内に収まるようリサイズ
 */
async function imagesToSinglePdfBlob(files, doPreview) {
  const { jsPDF } = window.jspdf;
  if (!jsPDF) {
    throw new Error("jsPDFが読み込まれていません。ネットワーク環境を確認してください。");
  }

  // A4縦: 210mm x 297mm
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  let pageIndex = 0;

  for (const file of files) {
    const img = await loadImageFromFile(file);

    // px → mm 変換をおおよそで行う（dpiを仮に 96 として計算）
    const dpi = 96;
    const mmPerInch = 25.4;
    const imgWidthMm = (img.width / dpi) * mmPerInch;
    const imgHeightMm = (img.height / dpi) * mmPerInch;

    // ページ内に収まるようにスケーリング
    const margin = 10; // 上下左右10mmマージン
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    const widthRatio = maxWidth / imgWidthMm;
    const heightRatio = maxHeight / imgHeightMm;
    const scale = Math.min(widthRatio, heightRatio, 1);

    const displayWidth = imgWidthMm * scale;
    const displayHeight = imgHeightMm * scale;

    const x = (pageWidth - displayWidth) / 2;
    const y = (pageHeight - displayHeight) / 2;

    // 画像をDataURLとして一時的に取得
    const imgDataUrl = await imageToDataUrl(img);

    if (pageIndex > 0) {
      pdf.addPage();
    }
    pdf.addImage(imgDataUrl, "JPEG", x, y, displayWidth, displayHeight);
    pageIndex++;

    // プレビュー用（最初の画像をキャンバスに描画）
    if (doPreview && pageIndex === 1) {
      const canvas = convertPreviewCanvas;
      const ctx = canvas.getContext("2d");
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.style.display = "block";
    }
  }

  const blob = pdf.output("blob");
  return blob;
}

// Imageオブジェクト → DataURL
function imageToDataUrl(img) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    resolve(dataUrl);
  });
}

/**
 * 単一ファイル用の変換処理
 * 画像→PDF以外の組み合わせを処理（PDFまとめは別関数）
 */
async function handleConversionMulti(inputType, outputType, file, fileName, doPreview) {
  // 1) 同じ形式 → そのままコピー
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
    const canvas = convertPreviewCanvas;
    const ctx = canvas.getContext("2d");

    if (doPreview) {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      canvas.style.display = "block";
    }

    const mimeType = outputType === "jpeg" ? "image/jpeg" : "image/png";

    const offCanvas = document.createElement("canvas");
    offCanvas.width = img.width;
    offCanvas.height = img.height;
    const offCtx = offCanvas.getContext("2d");
    offCtx.drawImage(img, 0, 0);
    const blob = await canvasToBlob(offCanvas, mimeType, 0.92);

    createDownloadLinkAppend(convertDownloadArea, blob, fileName);
    return;
  }

  // 3) その他は現状未対応
  throw new Error(
    `この組み合わせ（入力: ${inputType.toUpperCase()} → 出力: ${outputType.toUpperCase()}）は、現在のブラウザ版では未対応です。`
  );
}

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
    convertPreviewCanvas.style.display = "none";
    convertPreviewFrame.style.display = "none";
  }
}

// PDFを1つだけダウンロードリンク化
function createSingleDownloadLink(container, blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.textContent = `ダウンロード: ${fileName}`;
  link.className = "download-link";

  container.innerHTML = "";
  container.appendChild(link);
}

// 複数ファイル用（画像変換など）
function createDownloadLinkAppend(container, blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.textContent = `ダウンロード: ${fileName}`;
  link.className = "download-link";

  const wrapper = document.createElement("div");
  wrapper.appendChild(link);

  container.appendChild(wrapper);
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
        createDownloadLinkAppend(qrDownloadArea, blob, fileName);
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
        createDownloadLinkAppend(barcodeDownloadArea, blob, fileName);
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
