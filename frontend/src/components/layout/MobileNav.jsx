function MobileNav({ setSidebarOpen }) {
  return (
    <button
      type="button"
      className="mobile-nav-trigger"
      aria-label="Open navigation"
      onClick={() => setSidebarOpen(true)}
    >
      Menu
    </button>
  );
}

export default MobileNav;
