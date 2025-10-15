// Bridge React hooks to Preact hooks
import { useState, useEffect, useRef, useMemo, useCallback } from 'preact/hooks';
import { h, render, Component } from 'preact';

// Export Preact as React to trick React-based components
export {
  useState,
  useEffect,
  useRef,
  useMemo, 
  useCallback,
  h as createElement,
  render,
  Component
};

// Set up global React for components that check for it
if (typeof window !== 'undefined') {
  (window as any).React = {
    useState,
    useEffect,
    useRef,
    useMemo,
    useCallback,
    createElement: h,
    render,
    Component
  };
}
