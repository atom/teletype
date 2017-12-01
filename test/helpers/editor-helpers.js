exports.setEditorHeightInLines = async function setEditorHeightInLines (editor, lines) {
  editor.element.style.height = editor.getLineHeightInPixels() * lines + 'px'
  return editor.component.getNextUpdatePromise()
}

exports.setEditorWidthInChars = async function setEditorWidthInChars (editor, chars) {
  editor.element.style.width =
    editor.component.getGutterContainerWidth() +
    chars * editor.getDefaultCharWidth() +
    'px'
  return editor.component.getNextUpdatePromise()
}

exports.setEditorScrollTopInLines = async function setEditorScrollTopInLines (editor, lines) {
  editor.element.setScrollTop(editor.getLineHeightInPixels() * lines)
  return editor.component.getNextUpdatePromise()
}

exports.setEditorScrollLeftInChars = async function setEditorScrollLeftInChars (editor, chars) {
  editor.element.setScrollLeft(editor.getDefaultCharWidth() * chars)
  return editor.component.getNextUpdatePromise()
}
