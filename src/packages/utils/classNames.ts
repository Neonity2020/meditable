
export const genUpper2LowerKeyHash = (keys) => {
    return keys.reduce((acc, key) => {
        const value = key.toLowerCase().replace(/_/g, "-");

        return Object.assign(acc, { [key]: value });
    }, {});
};

export const CLASS_NAMES = genUpper2LowerKeyHash([
    // Editor
    'MEUI_FRAME',
    'MEUI_WRAPPER',
    'MEUI_SCROLLER',
    'MEUI_EDITOR',
    'MEUI_PRESENTATION',
    'MEUI_SCROLLER_DECORATION',
    'MEUI_EDITOR__WEB',
    'MEUI_EDITOR__PRINT',
    'MEUI_EDITOR__MOBILE',
    'MEUI_EDITOR__EMPTY',
    'MEUI_EDITOR__FOCUS_MODE',
    "MEUI_EDITOR__ACTIVE",
    'MEUI_EDITOR_ZONE',
    'MEUI_EDITOR_CONTENT',

    // Block
    'ME_CONTENT',
    'ME_CONTENT__SEARCHING',
    'ME_CONTENT__CONTROLLING',
    'ME_BLOCK',
    'ME_BLOCK__FOCUSED',
    'ME_BLOCK__ACTIVED',
    'ME_BLOCK__SELECTED',
    'ME_BLOCK__DROP_TARGET',
    'ME_EDITABLE',
    'ME_LANGUAGE',
    'ME_CODE',
    'ME_CODE_COPY',
    'ME_CODE_COPY__SUCCESS',
    'ME_PREVIEW',
    'ME_CONTAINER',
    'ME_TASK_LIST',
    'ME_TASK_LIST_ITEM_CHECKBOX',
    'ME_TASK_LIST_ITEM_CHECKBOX__CHECKED',
    'ME_TASK_LIST_ITEM_CONTENT',

    // Node
    "ME_NODE",
    "ME_TEXT",
    "ME_NODE__ACTIVED",
    "ME_MARKER",
    "ME_FIXED_MARKER",
    "MU_HEADER_SPACE",
    "ME_MATH",
    "ME_MATH_ERROR",
    "ME_MATH_MARKER",
    "ME_INLINE_RENDER",
    "ME_RUBY",
    "ME_RUBY_TEXT",
    "ME_SOFT_LINE_BREAK",
    "ME_LINE_END",
    "ME_HTML_VALID_TAG",
    "ME_HTML_ESCAPE",
    "ME_HTML_IMG",
    "ME_EMOJI",
    "ME_EMOJI_VALID",
    "ME_TAIL_HEADER",
    "ME_REFERENCE_IMAGE",
    "ME_IMAGE",
    "ME_IMAGE_ICON",
    "ME_IMAGE_LOADING_ICON",
    "ME_IMAGE_EMPTY",
    "ME_IMAGE_LOADING",
    "ME_IMAGE_ERROR",

    
    "ME_AUTO_LINK",
    "ME_AUTO_LINK_EXTENSION",
    "ME_BACKLASH",
    "ME_BUG",
    "ME_BULLET_LIST",
    "ME_BULLET_LIST_ITEM",
    "ME_CHECKBOX_CHECKED",
    "ME_CONTAINER_BLOCK",
    "ME_CONTAINER_PREVIEW",
    "ME_CONTAINER_ICON",
    "ME_COPY_REMOVE",
    "ME_DISABLE_HTML_RENDER",
    "ME_EMOJI_MARKED_TEXT",
    "ME_EMOJI_MARKER",
    "ME_EMPTY",
    "ME_FENCE_CODE",
    "ME_FLOWCHART",
    "ME_FOCUS_MODE",
    "ME_FRONT_MATTER",
    "ME_FRONT_ICON",
    "ME_GRAY",
    "ME_HARD_LINE_BREAK",
    "ME_HARD_LINE_BREAK_SPACE",
    
    "ME_HEADER_TIGHT_SPACE",
    "ME_HIDE",
    "ME_HIGHLIGHT",
    "ME_HTML_BLOCK",
    
    "ME_HTML_PREVIEW",
    "ME_HTML_TAG",
    "ME_IMAGE_FAIL",
    "ME_IMAGE_BUTTONS",
    "ME_IMAGE_LOADING",
    "ME_EMPTY_IMAGE",
    "ME_IMAGE_MARKED_TEXT",
    "ME_IMAGE_SRC",
    "ME_IMAGE_CONTAINER",
    "ME_INLINE_IMAGE",
    "ME_IMAGE_SUCCESS",
    "ME_IMAGE_UPLOADING",
    "ME_INLINE_IMAGE_SELECTED",
    "ME_INLINE_IMAGE_IS_EDIT",
    "ME_INDENT_CODE",
    "ME_INLINE_FOOTNOTE_IDENTIFIER",
    "ME_INLINE_RULE",
    "ME_LANGUAGE",
    "ME_LANGUAGE_INPUT",
    "ME_LINK",
    "ME_LINK_IN_BRACKET",
    "ME_LIST_ITEM",
    "ME_LOOSE_LIST_ITEM",
    
    "ME_SELECTED",
    
    "ME_MERMAID",
    "ME_MULTIPLE_MATH",
    "ME_NOTEXT_LINK",
    "ME_ORDER_LIST",
    "ME_ORDER_LIST_ITEM",
    "ME_OUTPUT_REMOVE",
    "ME_PARAGRAPH",
    "ME_RAW_HTML",
    "ME_REFERENCE_LABEL",
    "ME_REFERENCE_LINK",
    "ME_REFERENCE_MARKER",
    "ME_REFERENCE_TITLE",
    "ME_REMOVE",
    "ME_SELECTION",
    "ME_SEQUENCE",
    "ME_SHOW_PREVIEW",
    "ME_TASK_LIST",
    "ME_TASK_LIST_ITEM",
    "ME_TASK_LIST_ITEM_CHECKBOX",
    "ME_TIGHT_LIST_ITEM",
    "ME_TOOL_BAR",
    "ME_VEGA_LITE",
    "ME_WARN",
    "ME_SHOW_QUICK_INSERT_HINT",
]);