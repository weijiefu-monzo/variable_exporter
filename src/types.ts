type Error = {
  type: string;
  node: { id: string; name: string; type: string };
  message: string;
};
export type Results = {
  avoidBooleanOperation: Error[];
  avoidGroup: Error[];
  mustBeNamed: Error[];
  mustUseAutolayout: Error[];
  padding: Error[];
  gap: Error[];
  fill: Error[];
  stroke: Error[];
  cornerRadius: Error[];
  overrides: Error[];
};
export type Settings = {
  avoidBooleanOperation: boolean;
  avoidGroup: boolean;
  mustBeNamed: boolean;
  mustUseAutolayout: boolean;
  padding: boolean;
  gap: boolean;
  fill: boolean;
  stroke: boolean;
  cornerRadius: boolean;
  overrides: boolean;
};

export type Node =
  | FrameNode
  | ComponentNode
  | InstanceNode
  | TextNode
  | GroupNode
  | VectorNode
  | ComponentSetNode
  | BooleanOperationNode;
