import React, { useMemo } from 'react';

// A creative, theme-aligned loading animation.
// This component uses inline SVG and CSS animations to create a "neural network" effect.
// Colors are controlled by CSS variables defined in index.html for themeability.

const NUM_NODES = 35;
const NUM_NEIGHBORS_TO_CONNECT = 2;
const VIEWBOX_SIZE = 120;
const PADDING = 15;

type Node = {
  id: string;
  cx: number;
  cy: number;
};

type Edge = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

// Helper function to calculate distance between two nodes
const getDistance = (nodeA: Node, nodeB: Node): number => {
  const dx = nodeA.cx - nodeB.cx;
  const dy = nodeA.cy - nodeB.cy;
  return Math.sqrt(dx * dx + dy * dy);
};


export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg'; text?: string; }> = ({ size = 'md', text }) => {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-28 h-28',
  };

  const { nodes, edges } = useMemo(() => {
    const newNodes: Node[] = [];
    for (let i = 0; i < NUM_NODES; i++) {
      newNodes.push({
        id: `n${i}`,
        cx: PADDING + Math.random() * (VIEWBOX_SIZE - PADDING * 2),
        cy: PADDING + Math.random() * (VIEWBOX_SIZE - PADDING * 2),
      });
    }

    const newEdges: Edge[] = [];
    const edgeSet = new Set<string>(); // To prevent duplicate edges like a-b and b-a

    newNodes.forEach((node, i) => {
      const otherNodes = newNodes.slice(0, i).concat(newNodes.slice(i + 1));
      const sortedNeighbors = otherNodes
        .map(neighbor => ({
          ...neighbor,
          distance: getDistance(node, neighbor),
        }))
        .sort((a, b) => a.distance - b.distance);

      for (let j = 0; j < NUM_NEIGHBORS_TO_CONNECT; j++) {
        const neighbor = sortedNeighbors[j];
        if (neighbor) {
          // Create a canonical key for the edge to avoid duplicates
          const key = [node.id, neighbor.id].sort().join('-');
          if (!edgeSet.has(key)) {
            newEdges.push({
              id: `e${newEdges.length}`,
              x1: node.cx,
              y1: node.cy,
              x2: neighbor.cx,
              y2: neighbor.cy,
            });
            edgeSet.add(key);
          }
        }
      }
    });

    return { nodes: newNodes, edges: newEdges };
  }, []);


  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <style>{`
        @keyframes pulse {
          0%, 100% { r: 2; opacity: 0.7; }
          50% { r: 3; opacity: 1; }
        }
        @keyframes spark {
          0%, 100% { stroke: var(--spinner-edge-color); stroke-opacity: 0.6; }
          50% { stroke: var(--spinner-spark-color-1); stroke-opacity: 1; }
          75% { stroke: var(--spinner-spark-color-2); stroke-opacity: 0.8; }
        }
        .node {
          fill: var(--spinner-node-color);
          animation: pulse 2.5s infinite ease-in-out;
        }
        .edge {
          stroke: var(--spinner-edge-color);
          stroke-width: 0.75;
          animation: spark 3.5s infinite;
        }
      `}</style>
      <svg
        className={sizeClasses[size]}
        viewBox="0 0 120 120"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Loading animation"
        role="img"
      >
        <g>
          {edges.map((edge, i) => (
            <line
              key={edge.id}
              className="edge"
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              style={{ animationDelay: `${(i / edges.length) * 2}s` }}
            />
          ))}
          {nodes.map((node, i) => (
            <circle
              key={node.id}
              className="node"
              cx={node.cx}
              cy={node.cy}
              r="2"
              style={{ animationDelay: `${(i / nodes.length) * 2}s` }}
            />
          ))}
        </g>
      </svg>
      {text && <p className="text-sm text-gray-400 mt-2">{text}</p>}
    </div>
  );
};