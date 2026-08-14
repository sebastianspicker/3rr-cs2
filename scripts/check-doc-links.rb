#!/usr/bin/env ruby
# Validates repository-local Markdown targets so public docs cannot route to removed artifacts.

require "pathname"
require "uri"

ROOT = Pathname.new(File.expand_path("..", __dir__)).freeze

# Markdown destinations may use angle brackets for spaces or append an optional title.
def destination_path(raw_destination)
  destination = raw_destination.strip
  return destination[1...destination.index(">")].to_s if destination.start_with?("<")

  destination.split(/[[:space:]]+/, 2).first.to_s
end

# Remote, in-page, and site-root links are outside this local filesystem check.
def local_destination?(destination)
  !destination.empty? &&
    !destination.start_with?("#", "/") &&
    destination !~ /\A(?:https?|mailto):/i
end

failures = []

Dir.glob(ROOT.join("**/*.md")).sort.each do |filename|
  path = Pathname.new(filename)
  relative_parts = path.relative_path_from(ROOT).each_filename.to_a
  next if (relative_parts & %w[.git .internal node_modules dist coverage]).any?

  in_fence = false

  path.each_line.with_index(1) do |line, line_number|
    if line.match?(/^\s*```/)
      in_fence = !in_fence
      next
    end
    next if in_fence

    destinations = line.scan(/!?\[[^\]]*\]\(([^)]+)\)/).flatten
    definition = line.match(/^\s*\[[^\]]+\]:\s*(\S+)/)
    destinations << definition[1] if definition

    destinations.each do |raw_destination|
      destination = destination_path(raw_destination)
      next unless local_destination?(destination)

      relative_path = destination.split(/[?#]/, 2).first
      target = path.dirname.join(URI::DEFAULT_PARSER.unescape(relative_path)).cleanpath
      failures << "#{path.relative_path_from(ROOT)}:#{line_number}: #{destination}" unless target.exist?
    end
  end
end

unless failures.empty?
  warn "Broken repository-local Markdown links:"
  failures.each { |failure| warn "- #{failure}" }
  exit 1
end

puts "Documentation links passed."
