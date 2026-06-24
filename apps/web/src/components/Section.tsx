import styled from 'styled-components'

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
`
export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 2rem;
`
export const SectionTitle = styled.h2`
  font-size: 1rem;
  margin: 0;
  color: ${(p) => p.theme.colors.text};
`
export const TwoCol = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  @media (max-width: 880px) {
    grid-template-columns: 1fr;
  }
`
