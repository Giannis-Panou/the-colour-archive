/** Below 900 px the collections list is a drawer that closes after choosing. */
export const isNarrowScreen = () => window.matchMedia("(max-width: 899px)").matches;
/** From 600 px the sidebar sits beside the page and can be collapsed. */
export const isSidebarScreen = () => window.matchMedia("(min-width: 600px)").matches;
