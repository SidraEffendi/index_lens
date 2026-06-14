import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

export default function GraphView({ data, onNodeClick, loading }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || !svgRef.current) return

    const { nodes, edges } = data
    if (!nodes.length) return

    const el = svgRef.current
    const width = el.clientWidth || 700
    const height = 500

    // Deep-copy so D3 mutation doesn't affect React state
    const simNodes = nodes.map((n) => ({ ...n }))
    const nodeById = Object.fromEntries(simNodes.map((n) => [n.id, n]))
    const simEdges = edges
      .map((e) => ({ ...e, source: nodeById[e.source], target: nodeById[e.target] }))
      .filter((e) => e.source && e.target)

    d3.select(el).selectAll('*').remove()

    const svg = d3
      .select(el)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('width', '100%')
      .style('height', `${height}px`)

    const g = svg.append('g')

    svg.call(
      d3
        .zoom()
        .scaleExtent([0.1, 6])
        .on('zoom', (event) => g.attr('transform', event.transform))
    )

    // Pick first string column for node label / color
    const colorKey = Object.keys(nodes[0]).find((k) => k !== 'id') || 'id'
    const domain = [...new Set(simNodes.map((n) => String(n[colorKey] || '')))]
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(domain)

    const simulation = d3
      .forceSimulation(simNodes)
      .force('link', d3.forceLink(simEdges).distance(70).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide(16))

    const link = g
      .append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(simEdges)
      .join('line')
      .attr('stroke', '#d0d7de')
      .attr('stroke-width', 1.5)

    const node = g
      .append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .style('cursor', 'pointer')
      .call(
        d3
          .drag()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulation.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeClick && onNodeClick(d)
      })

    node
      .append('circle')
      .attr('r', 9)
      .attr('fill', (d) => colorScale(String(d[colorKey] || '')))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    node
      .append('text')
      .text((d) => String(d[colorKey] || d.id).slice(0, 14))
      .attr('x', 13)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#444')
      .style('pointer-events', 'none')

    node.append('title').text((d) =>
      Object.entries(d)
        .filter(([k]) => !['x', 'y', 'vx', 'vy', 'fx', 'fy', 'index'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    )

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => simulation.stop()
  }, [data, onNodeClick])

  if (loading) {
    return <div className="graph-placeholder">Building graph index…</div>
  }
  if (!data) {
    return <div className="graph-placeholder">Upload a dataset to visualise the graph</div>
  }
  if (data.nodes.length === 0) {
    return <div className="graph-placeholder">No nodes to display</div>
  }

  return <svg ref={svgRef} />
}
