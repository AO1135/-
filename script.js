// ========== タブ切り替え ==========

document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;

    // ボタンの active 切り替え
    document.querySelectorAll(".tab-button").forEach((b) => {
      b.classList.toggle("active", b === btn);
    });

    // タブコンテンツの切り替え
    document.querySelectorAll(".tab-content").forEach((sec) => {
      sec.classList.toggle("active", sec.id === target);
    });
  });
});

// ========== 画像変換機能 (JPEG / PNG) ==========

const imageInput = document.getElementById("image-input");
const imageFormatSelect = document.getElementById("image-format");
const imageFilenameInput = document.getElementById("image-filename");
const convertImageBtn = document.getElementById("convert-image-btn");
const imagePreviewCanvas = document.getElementById("image-preview");
const imageDownloadArea = document.getElementById("image-download-area");

let loadedImage = null;

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      loadedImage = img;
      const ctx = imagePreviewCanvas.getContext("2d");
      imagePreviewCanvas.width = img.width;
      imagePreviewCanvas.height = img.height;
      ctx.drawImage(img, 0, 0);
      imageDownloadArea.innerHTML = "";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

convertImageBtn.addEventListener("click", () => {
  if (!loadedImage) {
    alert("先に画像ファイルを選択してください。");
    return;
  }

  const ctx = imagePreviewCanvas.getContext("2d");
  imagePreviewCanvas.width = loadedImage.width;
  imagePreviewCanvas.height = loadedImage.height;
  ctx.drawImage(loadedImage, 0, 0);

  const mimeType = imageFormatSelect.value;
  const ext = mimeType === "image/png" ? "png" : "jpg";

  const baseName = imageFilenameInput.value.trim() || "converted_image";
  const fileName = `${baseName}.${ext}`;

  imagePreviewCanvas.toBlob(
    (blob) => {
      if (!blob) {
        alert("変換に失敗しました。");
        return;
      }
      createDownloadLink(imageDownloadArea, blob, fileName);
    },
    mimeType,
    0.92
  );
});

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

  // QRCode.toCanvas( canvas, text, options, callback )
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

  // JsBarcode(target, text, options)
  try {
    JsBarcode(barcodeSvg, text, {
      format: format,
      lineColor: "#000",
      width: 2,
      height: 80,
      displayValue: true,
    });

    // SVG を PNG に変換してダウンロード可能にする
    const baseName = barcodeFilenameInput.value.trim() || "barcode";
    const fileName = `${baseName}.png`;

    svgToPngBlob(barcodeSvg).then((blob) => {
      barcodeDownloadArea.innerHTML = "";
      createDownloadLink(barcodeDownloadArea, blob, fileName);
      copyBarcodeBtn.disabled = false;
    }).catch((err) => {
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

  svgToPngBlob(barcodeSvg).then(async (blob) => {
    try {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert("バーコード画像をクリップボードにコピーしました。");
    } catch (e) {
      console.error(e);
      alert("クリップボードへのコピーに失敗しました。");
    }
  });
});

// ========== 共通: ダウンロードリンク生成関数 ==========

function createDownloadLink(container, blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.textContent = `「${fileName}」としてダウンロード`;
  link.className = "download-link";

  // 前のURLを解放してから差し替える場合は、ここで管理してもよい
  container.innerHTML = "";
  container.appendChild(link);
}

// ========== SVG → PNG Blob 変換関数 ==========

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
