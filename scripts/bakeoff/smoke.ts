import { experimental_evaluate as evaluate } from 'ai'

/**
 * One Jev call, with everything the failure is hiding printed out.
 *
 * The AI SDK rejects with its own error classes rather than with plain
 * `Error`s, and a top-level await that rejects reports the value as
 * `#<Object>` and nothing else. This makes the smallest possible call
 * and prints the parts that actually say what went wrong -- the status
 * code, the response body, and the cause chain, none of which survive
 * the default report.
 */

console.log('key present:', Boolean(process.env.AI_GATEWAY_API_KEY))
console.log('key length :', process.env.AI_GATEWAY_API_KEY?.length ?? 0)
console.log('key prefix :', process.env.AI_GATEWAY_API_KEY?.slice(0, 5) ?? '—')

try {
  const result = await evaluate({
    model: 'typesafe-ai/jev',
    state: { sentence: 'The invoice was charged twice and I would like a refund.' },
    questions: {
      topic: {
        type: 'choice',
        instructions: 'What is this about?',
        criteria: {
          billing: 'Money, charges, refunds',
          technical: 'Bugs and outages',
          none: 'Neither of those',
        },
      },
      wantsRefund: { type: 'boolean', instructions: 'Is the writer asking for money back?' },
    },
  })

  console.log('\nOK. answers:')
  console.dir(result.answers, { depth: 6 })
  console.log('\nusage:', result.usage)
  console.log('warnings:', result.warnings)
  console.log('rounding:', result.rounding)
  console.log('providerMetadata:')
  console.dir(result.providerMetadata, { depth: 6 })
} catch (e) {
  console.log('\nFAILED. The error, unwrapped:\n')
  let error: unknown = e
  let depth = 0
  while (error && depth++ < 6) {
    const o = error as Record<string, unknown>
    console.log(`  [${depth}] ${o?.constructor?.name ?? typeof error}`)
    for (const field of ['name', 'message', 'statusCode', 'url', 'type', 'code', 'modelId']) {
      if (o?.[field] !== undefined) console.log(`      ${field}: ${String(o[field])}`)
    }
    if (o?.responseBody !== undefined) {
      console.log(`      responseBody: ${String(o.responseBody).slice(0, 2000)}`)
    }
    if (o?.data !== undefined) {
      console.log('      data:')
      console.dir(o.data, { depth: 5 })
    }
    error = o?.cause
    if (error) console.log('      ↓ caused by')
  }
  console.log('\nRaw:')
  console.dir(e, { depth: 4 })
  process.exitCode = 1
}
