"use client";

import React, { createContext, useContext, useState } from "react";

const SearchContext = createContext({
  searchQuery: "",
  setSearchQuery: () => {},
});

export function SearchProvider({ children }) {
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <SearchContext.Provider value={{ searchQuery, setSearchQuery }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useDashboardSearch() {
  return useContext(SearchContext);
}

