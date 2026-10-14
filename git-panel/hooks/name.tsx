import type { ClientModule } from 'claude-code'

// A file name cell: left click asks to expand the diff, right click asks for the menu.
export type NameProps = { name: string; dir: string; fg: string; muted: string; hoverBg: string }
type Local = { hover: boolean }

const Name: ClientModule<NameProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  surface.onPointer(e => {
    if (e.type === 'enter' || e.type === 'leave') surface.setState({ hover: e.type === 'enter' })
    else if (e.type === 'down') surface.post(e.button === 'right' ? { menu: true } : { press: true })
  })
  return (
    <Box backgroundColor={surface.state?.hover ? props.hoverBg : undefined}>
      <Text wrap="truncate-end">
        <Text color={props.fg}>{props.name}</Text>
        <Text color={props.muted}> {props.dir}</Text>
      </Text>
    </Box>
  )
}

export default Name
