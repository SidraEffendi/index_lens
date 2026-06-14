import { useEffect, useRef } from 'react'
import * as d3 from 'd3'

const MARGIN = { top: 20, right: 20, bottom: 48, left: 48 }

export default function SemanticView({ data, onPointClick, loading }) {
  const svgRef = useRef(null)

  useEffect(() => {
    if (!data || !svgRef.current) return

    const { points } = data
    if (!points.length) return

    const el = svgRef.current
    const width = el.clientWidth || 700
    const height = 500
    const iW = width - MARGIN.left - MARGIN.right
    const iH = height - MARGIN.top - MARGIN.bottom

    d3.select(el).selectAll('*').remove()

    const svg = d3
      .select(el)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .style('width', '100%')
      .style('height', `${height}px`)

    const root = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`)

    svg.call(
      d3.zoom()
        .scaleExtent([0.3, 10])
        .on('zoom', (e) => root.attr('transform', e.transform))
    )

    const xScale = d3.scaleLinear()
      .domain(d3.extent(points, (p) => p.x))
      .range([0, iW])
      .nice()

    const yScale = d3.scaleLinear()
      .domain(d3.extent(points, (p) => p.y))
      .range([iH, 0])
      .nice()

    const clusters = [...new Set(points.map((p) => p.cluster))].sort()
    const colorScale = d3.scaleOrdinal(d3.schemeTableau10).domain(clusters)

    // Axes
    root.append('g')
      .attr('transform', `translate(0,${iH})`)
      .call(d3.axisBottom(xScale).ticks(5).tickSize(-iH))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#f0f0f0'))
      .call((g) => g.select('.domain').remove())

    root.append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-iW))
      .call((g) => g.selectAll('.tick line').attr('stroke', '#f0f0f0'))
      .call((g) => g.select('.domain').remove())

    // Axis labels
    svg.append('text')
      .attr('x', MARGIN.left + iW / 2)
      .attr('y', height - 8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#adb5bd')
      .text('Semantic Dimension 1 (PCA)')

    svg.append('text')
      .attr('transform', `rotate(-90)`)
      .attr('x', -(MARGIN.top + iH / 2))
      .attr('y', 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', '11px')
      .attr('fill', '#adb5bd')
      .text('Semantic Dimension 2 (PCA)')

    // First data column for labels
    const labelKey = Object.keys(points[0]).find(
      (k) => !['id', 'x', 'y', 'cluster'].includes(k)
    ) || 'id'

    // Points
    const pointG = root.append('g').selectAll('g.pt')
      .data(points)
      .join('g')
      .attr('class', 'pt')
      .attr('transform', (p) => `translate(${xScale(p.x)},${yScale(p.y)})`)
      .style('cursor', 'pointer')
      .on('click', (event, p) => {
        event.stopPropagation()
        onPointClick && onPointClick(p)
      })

    pointG.append('circle')
      .attr('r', 8)
      .attr('fill', (p) => colorScale(p.cluster))
      .attr('stroke', '#fff')
      .attr('stroke-width', 2)

    pointG.append('text')
      .text((p) => String(p[labelKey]).slice(0, 14))
      .attr('x', 11)
      .attr('y', 4)
      .attr('font-size', '10px')
      .attr('fill', '#444')
      .style('pointer-events', 'none')

    pointG.append('title').text((p) =>
      Object.entries(p)
        .filter(([k]) => !['x', 'y', 'cluster', 'index'].includes(k))
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
    )
  }, [data, onPointClick])

  if (loading) return <div className="graph-placeholder">Computing semantic index…</div>
  if (!data) return <div className="graph-placeholder">Upload a dataset to see the semantic index</div>

  return <svg ref={svgRef} />
}
