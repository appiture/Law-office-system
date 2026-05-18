function ThemeToggle({ theme, toggleTheme }) {
  return (
    <button 
      type="button"
      className="theme-toggle-header-btn"
      onClick={toggleTheme}
      title="Toggle Theme"
    >
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

export default ThemeToggle;
