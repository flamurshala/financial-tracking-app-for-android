import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { MAX_IMPORT_BYTES, parseImportCsv } from "../utils/csvImport";
export async function chooseImportCsv() {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      "text/csv",
      "text/comma-separated-values",
      "text/plain",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset || !asset.name.toLowerCase().endsWith(".csv"))
    throw new Error("Choose a .csv file saved in UTF-8 format.");
  if (asset.size !== undefined && asset.size > MAX_IMPORT_BYTES)
    throw new Error("Choose a CSV no larger than 5 MB.");
  let bytes: Uint8Array;
  try {
    const file = new File(asset.uri);
    if (file.size > MAX_IMPORT_BYTES) throw new Error();
    bytes = await file.bytes();
  } catch {
    throw new Error(
      "Unable to read the selected CSV. Check the file is available and no larger than 5 MB.",
    );
  }
  if (bytes.length > MAX_IMPORT_BYTES)
    throw new Error("Choose a CSV no larger than 5 MB.");
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Use a valid UTF-8 CSV file.");
  }
  // Hash the decoded content; BOM variants remain the same content for repeat warnings.
  const hash = await digestStringAsync(
    CryptoDigestAlgorithm.SHA256,
    text.replace(/^\uFEFF/, ""),
  );
  return {
    fileName: asset.name.slice(0, 255),
    hash,
    rows: parseImportCsv(text),
  };
}
