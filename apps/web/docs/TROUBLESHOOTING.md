# Troubleshooting import and compile

| Message | Meaning | What to do |
| --- | --- | --- |
| "This file is not a PDF" | The content does not start with a PDF header. | Export the resume again as PDF from its original program. |
| "encrypted or password-protected" | The PDF has a password. | Remove the password in your PDF viewer, then upload again. |
| "no extractable text ... OCR has NOT been run" | Scanned or image-only PDF. | Enter the content manually, or use a separate OCR tool and import its text. |
| "only N of M pages have a usable text layer" | Some pages are images. | Check those pages against the original. |
| "may be truncated or corrupted" | No end-of-file marker. | Upload again from the original file. |
| "named .pdf but its contents are not a PDF" | Wrong file type. | Choose the correct file. |
| "Unbalanced braces" / "never closed" / "does not match" | LaTeX structure error. | Fix the line shown. Usually a missing `}` or `\end`. |
| "\\input ... not allowed" / "\\write18 ... not allowed" | The source tries to read files or run programs. | Remove the command. Resume source does not need it. |
| "Gemini returned no plain text" | Gemini may have created a file instead. | Download the file from the Gemini tab and import it. |
| "Compilation took longer than ..." | The document never finishes, often an infinite macro. | Simplify the document, then compile again. |
| "The LaTeX compiler is not installed on this server." | pdflatex is missing. | Install TeX Live on the server (see INSTALLATION.md). |
