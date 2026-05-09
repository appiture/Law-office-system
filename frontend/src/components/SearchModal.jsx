import React from "react";
import ReactDOM from "react-dom";
import DashboardSearchResults from "./DashboardSearchResults";
import "./SearchModal.css";


function SearchModal({ query, cases, tasks, putUpDates, onClose }) {
  const handleResultClick = () => {
    onClose(); // Close modal when a result is clicked
  };

  return ReactDOM.createPortal(
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Search Results for "{query}"</h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close Search">
            ✖️
          </button>
        </div>
        <DashboardSearchResults
          query={query}
          cases={cases}
          tasks={tasks}
          putUpDates={putUpDates}
          onResultClick={handleResultClick}
        />
      </div>
    </div>,
    document.body
  );
}

export default SearchModal;




