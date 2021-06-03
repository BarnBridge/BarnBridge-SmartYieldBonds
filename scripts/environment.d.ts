declare global {
  namespace NodeJS {
    interface ProcessEnv {
      BARN: string;
    }
  }
}

// convert file into a module by adding an empty export statement.
export {}
