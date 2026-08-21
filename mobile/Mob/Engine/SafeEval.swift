import Foundation

/// Same convention as jarvis.py's safe_eval: a hand-rolled recursive-descent
/// parser restricted to arithmetic, never NSExpression or any string-to-code
/// evaluation path.
enum SafeEvalError: Error, LocalizedError {
    case unexpectedCharacter(Character)
    case unexpectedEnd
    case unexpectedToken(String)

    var errorDescription: String? {
        switch self {
        case .unexpectedCharacter(let c): return "unexpected character: \(c)"
        case .unexpectedEnd: return "unexpected end of expression"
        case .unexpectedToken(let t): return "unexpected token: \(t)"
        }
    }
}

enum SafeEval {
    static func evaluate(_ expression: String) throws -> Double {
        var parser = Parser(expression)
        let value = try parser.parseExpression()
        try parser.expectEnd()
        return value
    }

    private struct Parser {
        private let characters: [Character]
        private var index = 0

        init(_ text: String) {
            self.characters = Array(text)
        }

        mutating func expectEnd() throws {
            skipWhitespace()
            if index != characters.count {
                throw SafeEvalError.unexpectedCharacter(characters[index])
            }
        }

        mutating func parseExpression() throws -> Double {
            var value = try parseTerm()
            while true {
                skipWhitespace()
                guard let op = peek(), op == "+" || op == "-" else { break }
                index += 1
                let rhs = try parseTerm()
                value = op == "+" ? value + rhs : value - rhs
            }
            return value
        }

        mutating func parseTerm() throws -> Double {
            var value = try parseUnary()
            while true {
                skipWhitespace()
                guard let op = peek(), op == "*" || op == "/" || op == "%" else { break }
                index += 1
                let rhs = try parseUnary()
                switch op {
                case "*": value *= rhs
                case "/": value /= rhs
                default: value = value.truncatingRemainder(dividingBy: rhs)
                }
            }
            return value
        }

        mutating func parseUnary() throws -> Double {
            skipWhitespace()
            if let c = peek(), c == "+" || c == "-" {
                index += 1
                let value = try parseUnary()
                return c == "-" ? -value : value
            }
            return try parsePower()
        }

        mutating func parsePower() throws -> Double {
            let base = try parseAtom()
            skipWhitespace()
            if peek() == "^" {
                index += 1
                let exponent = try parseUnary()
                return pow(base, exponent)
            }
            return base
        }

        mutating func parseAtom() throws -> Double {
            skipWhitespace()
            guard let c = peek() else { throw SafeEvalError.unexpectedEnd }
            if c == "(" {
                index += 1
                let value = try parseExpression()
                skipWhitespace()
                guard peek() == ")" else { throw SafeEvalError.unexpectedToken(")") }
                index += 1
                return value
            }
            if c.isNumber || c == "." {
                return try parseNumber()
            }
            throw SafeEvalError.unexpectedCharacter(c)
        }

        mutating func parseNumber() throws -> Double {
            let start = index
            while let c = peek(), c.isNumber || c == "." {
                index += 1
            }
            let text = String(characters[start..<index])
            guard let value = Double(text) else {
                throw SafeEvalError.unexpectedToken(text)
            }
            return value
        }

        func peek() -> Character? {
            index < characters.count ? characters[index] : nil
        }

        mutating func skipWhitespace() {
            while let c = peek(), c == " " || c == "\t" {
                index += 1
            }
        }
    }
}
